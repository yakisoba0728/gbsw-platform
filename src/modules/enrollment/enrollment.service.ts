import { randomUUID } from "node:crypto";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { keepsAccountActive } from "@/core/authz/enrollment-status";
import { assertCan } from "@/core/authz/errors";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import * as repo from "./enrollment.repo";
import type { EnrollmentChange } from "./enrollment.schema";

export class EnrollmentError extends Error {
  /**
   * 사람이 읽을 수 있는 상세 메시지. 학생 이름처럼 코드로 미리 정해둘 수 없는
   * 내용이 있을 때만 채운다 — 있으면 화면이 MESSAGES 사전 대신 이 값을 그대로 보여준다.
   */
  detail?: string;

  constructor(code: string, detail?: string) {
    super(code);
    this.detail = detail;
  }
}

export async function listStudents(actor: SessionUser) {
  await assertCan(actor, "student:manage");
  return repo.listByYear(await getCurrentYear());
}

/** 감사로그에 이름을 남길 항목들. 순서가 곧 표시 순서다. */
const FIELDS = ["grade", "classNo", "number", "status"] as const;

/** "1학년 3반 3번" — 충돌 오류에 자리를 사람이 읽게 적을 때 쓴다. */
function formatSlot(grade: number, classNo: number, number: number): string {
  return `${grade}학년 ${classNo}반 ${number}번`;
}

/** 재학으로 저장되는 (grade, classNo, number) — 아니면 null. 반·번호 충돌 검사에만 쓴다. */
function enrolledSlot(
  change: EnrollmentChange,
): { grade: number; classNo: number; number: number } | null {
  if (change.status !== "ENROLLED") return null;
  if (change.grade === null || change.classNo === null || change.number === null) {
    return null;
  }
  return { grade: change.grade, classNo: change.classNo, number: change.number };
}

/**
 * 표에서 고친 것을 한 번에 저장한다.
 *
 * 바뀐 줄만 쓴다. 표가 전체를 보내오더라도 여기서 현재 값과 대조해 걸러낸다 —
 * 안 그러면 아무것도 안 고치고 저장만 눌러도 전교생 감사로그가 쌓인다.
 *
 * 검증 → (grade, classNo, number) 충돌 검사 → 단일 트랜잭션 저장 → 커밋 후 감사로그,
 * 순서를 반드시 지킨다. DB에 아무것도 쓰기 전에 실패할 수 있는 건 전부 앞에서 끝내야
 * "절반만 저장됨" 상태가 생기지 않는다.
 *
 * 감사로그는 학생 1명당 1줄이다. 일괄 작업이어도 나중에 "이 학생이 왜 3반이 됐지"를
 * 추적하려면 건별이어야 한다. 같은 저장에 속한 줄은 batch로 묶어 본다.
 */
export async function saveEnrollments(
  actor: SessionUser,
  changes: EnrollmentChange[],
  expectedYear: number,
): Promise<{ saved: number }> {
  await assertCan(actor, "student:manage");

  const year = await getCurrentYear();
  // 렌더 시점에 표가 실어 온 학년도와 지금의 현재 학년도를 대조한다. 다르면 다른
  // 관리자가 그 사이 학년도를 넘긴 것이다 — 2026년을 보고 만든 수정이 2027년에
  // 새 소속으로 쓰이고 계정까지 잠기는 사고를 저장 전에 막는다 (C2).
  if (year !== expectedYear) {
    throw new EnrollmentError("YEAR_MISMATCH");
  }

  const currentRows = await repo.listByYear(year);
  const byId = new Map(currentRows.map((r) => [r.studentProfileId, r]));

  // 같은 studentProfileId가 배열에 두 번 오면 마지막 값만 남긴다 (M5) — 두 번 저장되고
  // 감사로그가 두 줄 남는 걸 막는다. 조작된 입력이 아니라면 원래 한 번만 온다.
  const deduped = [...new Map(changes.map((c) => [c.studentProfileId, c])).values()];

  // 먼저 전부 검증한다. 절반만 저장되는 게 제일 나쁘다.
  const planned: {
    change: EnrollmentChange & { userId: string };
    active: boolean;
    changed: string[];
  }[] = [];

  for (const input of deduped) {
    const before = byId.get(input.studentProfileId);
    // 세션에서 유도할 수 없는 식별자라 반드시 대조한다.
    if (!before) throw new EnrollmentError("UNKNOWN_STUDENT");

    const enrolled = input.status === "ENROLLED";
    if (enrolled && (input.grade === null || input.classNo === null || input.number === null)) {
      throw new EnrollmentError("INCOMPLETE_ENROLLED");
    }

    // 재학이 아니면 반·번호를 지운다 — 졸업·자퇴에 반과 번호는 의미가 없다.
    const change = {
      ...input,
      grade: enrolled ? input.grade : null,
      classNo: enrolled ? input.classNo : null,
      number: enrolled ? input.number : null,
      userId: before.userId,
    };

    const changed = FIELDS.filter(
      (f) => before[f] !== change[f],
    ) as unknown as string[];
    if (changed.length === 0) continue;

    const active = keepsAccountActive(input.status);

    // 자기 자신을 비재학으로 돌리는 저장은 스스로를 영구 로그아웃시킨다 (I3).
    // Better Auth admin의 set-role로 승격된 관리자는 StudentProfile이 남아 있어
    // 이 표에도 나올 수 있다 — admin-user.service의 CANNOT_DEACTIVATE_SELF와 짝을 이룬다.
    if (before.userId === actor.id && !active) {
      throw new EnrollmentError("CANNOT_DEACTIVATE_SELF");
    }

    planned.push({ change, active, changed });
  }

  if (planned.length === 0) return { saved: 0 };

  // (grade, classNo, number) 충돌을 배치 내부끼리도, 저장 안 하는 기존 행과도 미리
  // 검사한다 (C1) — DB 유일 제약에 닿기 전에 어느 학생인지 이름과 함께 반려한다.
  //
  // 주의: 번호 교환(A 3번 ↔ B 4번)은 이 저장이 단일 트랜잭션이어도 성공하지 않는다.
  // Postgres 유일 제약은 DEFERRABLE이 아니면 문장 단위로 검사하므로, B가 아직 4번을
  // 차지한 채로 A를 4번에 앉히는 문장이 그 자리에서 걸린다. 순서를 바꿔도 마찬가지라
  // 고칠 수 있는 문제가 아니다 (명단 업로드의 "지우고 새로 넣기"가 3단계에서 이걸
  // 푼다). 그래서 여기서는 "지금 그 자리를 다른 학생이 차지하고 있는가"만 보고,
  // 그 학생이 이번 배치에서 다른 자리로 옮기는 중이어도 똑같이 반려한다.
  const targetOwner = new Map<string, string>();
  for (const { change } of planned) {
    const slot = enrolledSlot(change);
    if (!slot) continue;
    const key = `${slot.grade}-${slot.classNo}-${slot.number}`;
    const label = formatSlot(slot.grade, slot.classNo, slot.number);

    const dupInBatch = targetOwner.get(key);
    if (dupInBatch && dupInBatch !== change.studentProfileId) {
      const a = byId.get(dupInBatch)?.name ?? dupInBatch;
      const b = byId.get(change.studentProfileId)?.name ?? change.studentProfileId;
      throw new EnrollmentError(
        "ENROLLMENT_CONFLICT",
        `${label} 자리가 겹칩니다: ${a}, ${b}`,
      );
    }
    targetOwner.set(key, change.studentProfileId);

    const occupant = currentRows.find(
      (r) =>
        r.studentProfileId !== change.studentProfileId &&
        r.status === "ENROLLED" &&
        r.grade === slot.grade &&
        r.classNo === slot.classNo &&
        r.number === slot.number,
    );
    if (occupant) {
      const mover = byId.get(change.studentProfileId)?.name ?? change.studentProfileId;
      throw new EnrollmentError(
        "ENROLLMENT_CONFLICT",
        `${label} 자리가 겹칩니다: ${occupant.name}, ${mover}`,
      );
    }
  }

  const items: repo.PlannedEnrollment[] = planned.map(({ change, active, changed }) => ({
    ...change,
    accountActive: active,
    // status가 안 바뀌면 계정도 건드리지 않는다 — 번호만 고쳐도 잠긴 계정이
    // 조용히 풀리는 걸 막는다 (I1).
    statusChanged: changed.includes("status"),
  }));

  try {
    await repo.applyAll(year, items);
  } catch (error) {
    if (error instanceof repo.NumberTakenError) {
      throw new EnrollmentError("NUMBER_TAKEN");
    }
    throw error;
  }

  // 커밋에 성공한 뒤에만 기록한다. recordAudit은 전역 Prisma 클라이언트를 써서
  // 위 트랜잭션에 못 끼므로, 저장이 실제로 전부 끝난 다음이어야 감사로그도
  // 전부 아니면 전무가 된다.
  //
  // actorName을 넘긴다 (M8) — 안 넘기면 recordAudit이 호출마다 이름을 다시
  // 조회한다. 275명 저장 = 최대 550회 순차 왕복이 되어 리버스 프록시
  // 타임아웃에 걸릴 수 있다. actor(SessionUser)에 이미 이름이 있으므로
  // 조회 자체가 불필요하다 — 선택적 최적화 경로일 뿐, 안 넘기는 호출부는
  // 여전히 정상 동작한다(기존 규약을 깨지 않는다).
  const batch = randomUUID();
  for (const { change, active, changed } of planned) {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "enrollment:update",
      targetType: "StudentProfile",
      targetId: change.studentProfileId,
      // 바뀐 값이 아니라 바뀐 항목 이름만. batch로 같은 저장임을 묶는다.
      metadata: { changed, batch, year },
    });

    // 계정 상태가 실제로 뒤집힐 때만 admin-users와 같은 형식으로 한 줄 더 남긴다 (I2).
    // targetType/targetId를 User/userId로 맞춰야 사용자 상세의 이력 조회
    // (admin-user.repo의 findRelatedAudit, targetId = userId)가 이 기록을 찾는다.
    const before = byId.get(change.studentProfileId);
    if (changed.includes("status") && before && before.accountActive !== active) {
      await recordAudit({
        actorUserId: actor.id,
        actorName: actor.name,
        action: active ? "user:activate" : "user:deactivate",
        targetType: "User",
        targetId: change.userId,
      });
    }
  }

  return { saved: planned.length };
}
