import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import { generateUniqueCode, toExpiresAt } from "@/modules/invites/invite.service";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import { buildExportRows } from "./roster.export";
import { parseRoster, type RosterRow } from "./roster.parse";
import { bulkDeleteThreshold, planRoster, type RosterPlan } from "./roster.plan";
import * as repo from "./roster.repo";

export class RosterError extends Error {}

/** 종이로 나눠주는 코드다. 무기한으로 두면 잃어버린 종이가 영원히 유효하다 —
 * 기존 발급 화면(invite-form.tsx)의 expiresInDays 관례를 따라 기본 만료를 둔다. */
const INVITE_EXPIRES_DAYS = 90;

async function assertMayImport(actor: SessionUser): Promise<void> {
  // 소속을 바꾸고 초대코드도 만든다. 둘 다 확인한다.
  await assertCan(actor, "student:manage");
  await assertCan(actor, "invite:create");
}

/** 미리보기. **아무것도 저장하지 않는다.** */
export async function previewRoster(
  actor: SessionUser,
  file: { filename: string; buffer: Buffer },
): Promise<{ year: number; rows: RosterRow[]; plan: RosterPlan; notices: string[] }> {
  await assertMayImport(actor);

  const year = await getCurrentYear();
  const { rows, notices } = await parseRoster(file);
  if (rows.length === 0) throw new RosterError("EMPTY");

  const plan = planRoster(rows, await repo.listExisting(year));
  return { year, rows, plan, notices };
}

/**
 * 전체 명단 내보내기. **아무것도 쓰지 않는다** — 읽기만 하므로 recordAudit을 남기지
 * 않는다 (프로젝트 규칙은 생성·수정·삭제에만 감사로그를 요구한다).
 *
 * 페이지가 이미 requirePermission으로 막아도 여기서 can()을 다시 검사한다
 * (defense-in-depth) — 서버 액션을 직접 호출하는 경로가 생겨도 뚫리지 않도록.
 */
export async function exportRoster(
  actor: SessionUser,
): Promise<{ year: number; rows: (string | number | null)[][] }> {
  await assertCan(actor, "student:manage");

  const year = await getCurrentYear();
  const rows = buildExportRows(await repo.listExisting(year));
  return { year, rows };
}

/**
 * 확정 반영.
 *
 * 클라이언트가 돌려보낸 행을 **서버가 다시 분류한다.** 미리보기 결과를 그대로 믿으면
 * 중간에 손댄 값이 그대로 들어가고, 그 사이 DB가 바뀌었을 수도 있다.
 *
 * `confirmedDeletionIds`는 미리보기가 관리자에게 보여준 삭제 대상(missingFromFile)의
 * studentProfileId 목록이다 — boolean 플래그가 아니라 **집합**을 받는 이유는, 확정
 * 시점에 서비스가 삭제 대상을 다시 계산하기 때문이다(I-2). 그 사이 DB가 바뀌면(예:
 * 파일에 없던 학생이 초대코드로 막 가입해 새 StudentProfile이 생기면) boolean만으로는
 * "삭제에 동의했다"는 사실과 "무엇을 보고 동의했는지"를 구분할 수 없어, 관리자가 본
 * 적 없는 학생이 조용히 삭제될 수 있다. 서비스가 다시 세운 집합과 이 목록을 대조해
 * 다르면 거부한다. 빈 배열이 곧 "확인 안 함"이다.
 *
 * `deletionCountConfirmation`은 삭제 건수가 임계(bulkDeleteThreshold)를 넘는 대량
 * 삭제에서만 의미가 있다(I-3) — 잘못된 파일(다른 학년만 담긴 파일, 다른 학교 파일)을
 * 올렸을 때 체크박스 하나가 마지막 방어선이 되지 않도록, 관리자가 직접 센 건수와
 * 서버가 다시 계산한 건수를 대조한다.
 *
 * 되돌릴 수 없는 유일한 동작이라 화면 체크박스·입력칸만이 아니라 서버가 다시
 * 강제한다. 서버 액션을 직접 호출하면 화면의 확인 절차는 건너뛸 수 있기 때문이다.
 */
export async function applyRosterPlan(
  actor: SessionUser,
  expectedYear: number,
  rows: RosterRow[],
  confirmedDeletionIds: string[],
  deletionCountConfirmation: number | null,
): Promise<{
  saved: number;
  deleted: number;
  invites: Awaited<ReturnType<typeof repo.applyRoster>>["invites"];
}> {
  await assertMayImport(actor);

  // 경계 zod(rosterRowsSchema의 .min(1))가 항상 이 함수 앞에 있다는 보장은 없다 —
  // "서비스만 있으면 진입점을 갈아끼울 수 있다"가 이 저장소의 설계 목표다(CLAUDE.md).
  // 새 진입점이 zod를 빠뜨리면 rows: [] 한 번에 명단에 있던 전교생이 통째로
  // missingFromFile로 잡힌다 — 서비스에도 최소 방어를 둔다 (M1).
  if (rows.length === 0) throw new RosterError("EMPTY_ROWS");

  const year = await getCurrentYear();
  if (year !== expectedYear) throw new RosterError("YEAR_CHANGED");

  const existing = await repo.listExisting(year);
  const plan = planRoster(rows, existing);
  if (plan.hasBlockingError) throw new RosterError("BLOCKED");

  // 자기 계정이 삭제 대상에 들어가면 거부한다. listExisting이 role: STUDENT로 걸러서
  // 관리자 본인 행이 missingFromFile에 섞일 일이 없어 도달하기 어렵지만, 그건 그
  // 필터의 부수효과일 뿐 이 함수의 불변식이 아니다 — 아래의 CANNOT_DEACTIVATE_SELF와
  // 같은 이유로 명시적으로 막는다.
  if (plan.missingFromFile.some((m) => m.userId === actor.id)) {
    throw new RosterError("CANNOT_DELETE_SELF");
  }

  // I-2: 미리보기가 보여준 삭제 대상과 지금 다시 세운 삭제 대상이 정확히 같은
  // 집합이어야 한다. 순서·중복은 의미가 없으므로 Set으로 비교한다 — 관리자가
  // 확인 체크를 하지 않아 빈 배열을 보낸 경우도 여기서 걸린다(빈 배열 ≠ 비어있지
  // 않은 삭제 대상 집합).
  const currentDeletionIds = new Set(plan.missingFromFile.map((m) => m.studentProfileId));
  const confirmedSet = new Set(confirmedDeletionIds);
  const deletionSetMatches =
    currentDeletionIds.size === confirmedSet.size &&
    [...currentDeletionIds].every((id) => confirmedSet.has(id));
  if (!deletionSetMatches) throw new RosterError("DELETION_SET_CHANGED");

  // I-3: 삭제 건수가 임계를 넘으면 체크박스만으로 부족하다 — 관리자가 직접 입력한
  // 건수가 서버가 다시 센 건수와 정확히 같아야 한다. 임계 이하에서는
  // deletionCountConfirmation을 보지 않는다(화면에 입력칸 자체가 없다).
  const deleteCount = plan.missingFromFile.length;
  if (deleteCount > bulkDeleteThreshold(plan.totalStudents) && deletionCountConfirmation !== deleteCount) {
    throw new RosterError("DELETION_COUNT_MISMATCH");
  }

  const userIdByProfile = new Map(existing.map((s) => [s.studentProfileId, s.userId]));
  const accountActiveByProfile = new Map(
    existing.map((s) => [s.studentProfileId, s.accountActive]),
  );

  // 지우고 새로 넣으므로, 바뀌지 않은 학생의 배정도 다시 만들어야 한다.
  // Set으로 미리 모아 두어야 학생마다 세 배열을 훑는 O(n²)을 피한다.
  const reassignedIds = new Set(plan.reassign.map((r) => r.studentProfileId));
  const statusChangedIds = new Set(plan.statusChange.map((r) => r.studentProfileId));
  const newAssignmentIds = new Set(plan.newAssignment.map((r) => r.studentProfileId));
  const missingIds = new Set(plan.missingFromFile.map((m) => m.studentProfileId));

  const untouched = existing
    .filter(
      (s) =>
        s.status !== null &&
        !reassignedIds.has(s.studentProfileId) &&
        !statusChangedIds.has(s.studentProfileId) &&
        !newAssignmentIds.has(s.studentProfileId) &&
        !missingIds.has(s.studentProfileId),
    )
    .map((s) => ({
      line: 0,
      studentCode: s.studentCode,
      name: s.name,
      birthDate: s.birthDate,
      grade: s.grade,
      classNo: s.classNo,
      number: s.number,
      status: s.status as RosterRow["status"],
      errors: [],
      studentProfileId: s.studentProfileId,
      beforeName: s.name,
    }));

  // 기존 Enrollment.status와 다른 항목만 계정 상태를 건드린다 (C1) — enrollment.repo.ts의
  // applyAll이 statusChanged로 이미 고친 것과 같은 방식이다. reassign/untouched는 학적
  // 자체가 그대로이므로 항상 false, statusChange/newAssignment는 항상 true다.
  const assignments: repo.RosterAssignment[] = [
    ...plan.reassign.map((r) => ({ ...r, statusChanged: false })),
    ...plan.statusChange.map((r) => ({ ...r, statusChanged: true })),
    ...plan.newAssignment.map((r) => ({ ...r, statusChanged: true })),
    ...untouched.map((r) => ({ ...r, statusChanged: false })),
  ];

  // 자기 자신을 비활성으로 돌리는 반영은 스스로를 영구 로그아웃시킨다.
  // 지금은 listExisting의 role:STUDENT 필터 덕에 관리자 본인 행이 여기 섞일 일이
  // 없지만, 그건 그 필터의 부수효과일 뿐이다 — 필터가 넓어지면 조용히 뚫린다.
  // enrollment.service.ts의 CANNOT_DEACTIVATE_SELF와 짝을 맞춰 여기서도 명시적으로 막는다.
  const locksOutSelf = assignments.some(
    (a) =>
      a.statusChanged &&
      a.status !== "ENROLLED" &&
      userIdByProfile.get(a.studentProfileId!) === actor.id,
  );
  if (locksOutSelf) throw new RosterError("CANNOT_DEACTIVATE_SELF");

  // 비재학 신규 줄은 계정이 필요 없다 (I1) — studentInviteMetaSchema가 학년·반·번호를
  // 필수 정수로 요구하는데 비재학은 셋 다 null이라, 코드를 만들어도 가입이 영원히
  // ZodError로 막힌다. ENROLLED인 신규만 초대 대상으로 삼는다.
  const eligibleNewStudents = plan.newStudents.filter((r) => r.status === "ENROLLED");

  // invite.service.ts의 generateUniqueCode()로 통일한다 (I2) — DB를 확인하고 5회
  // 재시도하는 이 저장소의 공용 규약이다. Set은 이번 배치 안에서의 중복까지 막는다 —
  // generateUniqueCode() 혼자서는 아직 커밋되지 않은 같은 배치의 다른 코드를 볼 수 없다.
  const codes = new Set<string>();
  while (codes.size < eligibleNewStudents.length) {
    codes.add(await generateUniqueCode());
  }
  const codeList = [...codes];
  const newStudents = eligibleNewStudents.map((row, i) => ({ row, code: codeList[i]! }));

  let applied: Awaited<ReturnType<typeof repo.applyRoster>>;
  try {
    applied = await repo.applyRoster(year, {
      assignments,
      newStudents,
      inviteExpiresAt: toExpiresAt(INVITE_EXPIRES_DAYS),
      managedStudentProfileIds: existing.map((s) => s.studentProfileId),
      deleteStudentProfileIds: plan.missingFromFile.map((m) => m.studentProfileId),
      createdById: actor.id,
    });
  } catch (error) {
    if (error instanceof repo.InviteCodeCollisionError) {
      throw new RosterError("CODE_COLLISION");
    }
    throw error;
  }
  const { invites } = applied;

  await recordAudit({
    actorUserId: actor.id,
    action: "enrollment:import",
    targetType: "AcademicYear",
    targetId: String(year),
    // 건수만 남긴다. 학생 이름·소속이 들어가면 감사로그가 명단 사본이 된다.
    metadata: {
      year,
      reassign: plan.reassign.length,
      statusChange: plan.statusChange.length,
      newAssignment: plan.newAssignment.length,
      newStudents: plan.newStudents.length,
      invitesIssued: invites.length,
      deleted: plan.missingFromFile.length,
    },
  });

  // 삭제된 학생마다 한 줄씩 남긴다. targetId(userId)만 담는다 — 계정이 사라진 뒤라
  // 이름 없이도 무엇이 지워졌는지는 충분히 특정되고, 이름을 넣으면 감사로그가 삭제된
  // 개인정보의 사본이 된다. 누가 지웠는지는 actorName이 남긴다.
  //
  // actorName을 미리 넘긴다 (M8) — 안 넘기면 recordAudit이 호출마다 이름을
  // 다시 조회한다. 275명 삭제 = 275회 순차 왕복이 되어 리버스 프록시
  // 타임아웃에 걸릴 수 있다. actor(SessionUser)에 이미 이름이 있다 —
  // 선택적 최적화 경로일 뿐, 안 넘기는 호출부는 여전히 정상 동작한다.
  for (const m of plan.missingFromFile) {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "user:delete",
      targetType: "User",
      targetId: m.userId,
    });
  }

  // 계정 상태가 실제로 뒤집힐 때만 admin-users·enrollment와 같은 형식으로 한 줄 더
  // 남긴다 (I4) — userId만 담으므로 감사로그가 명단 사본이 되지 않는다.
  // targetType/targetId를 User/userId로 맞춰야 사용자 상세의 이력 조회
  // (admin-user.repo의 findRelatedAudit, targetId = userId)가 이 기록을 찾는다.
  for (const a of assignments) {
    if (!a.statusChanged) continue;
    const before = accountActiveByProfile.get(a.studentProfileId!);
    const active = a.status === "ENROLLED";
    if (before === undefined || before === active) continue;

    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: active ? "user:activate" : "user:deactivate",
      targetType: "User",
      targetId: userIdByProfile.get(a.studentProfileId!)!,
    });
  }

  // deleted도 감사로그 metadata의 deleted와 같은 값(plan.missingFromFile.length)에서
  // 나온다 — 반영 건수만 보여주면 "250건 반영했습니다" 뒤에 50명이 삭제됐다는 사실이
  // 묻힌다 (Minor-4).
  return { saved: assignments.length, deleted: plan.missingFromFile.length, invites };
}
