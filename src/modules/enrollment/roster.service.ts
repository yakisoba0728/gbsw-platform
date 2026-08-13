import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { generateUniqueCode, toExpiresAt } from "@/modules/invites/invite.service";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import { buildExportRows } from "./roster.export";
import { parseRoster, type RosterRow } from "./roster.parse";
import { planRoster, type RosterPlan } from "./roster.plan";
import * as repo from "./roster.repo";

export class RosterError extends Error {}

/** 종이로 나눠주는 코드다. 무기한으로 두면 잃어버린 종이가 영원히 유효하다 —
 * 기존 발급 화면(invite-form.tsx)의 expiresInDays 관례를 따라 기본 만료를 둔다. */
const INVITE_EXPIRES_DAYS = 90;

function assertMayImport(actor: SessionUser) {
  // 소속을 바꾸고 초대코드도 만든다. 둘 다 확인한다.
  if (!can(actor, "student:manage") || !can(actor, "invite:create")) {
    throw new Error("FORBIDDEN");
  }
}

/** 미리보기. **아무것도 저장하지 않는다.** */
export async function previewRoster(
  actor: SessionUser,
  file: { filename: string; buffer: Buffer },
): Promise<{ year: number; rows: RosterRow[]; plan: RosterPlan }> {
  assertMayImport(actor);

  const year = await getCurrentYear();
  const rows = await parseRoster(file);
  if (rows.length === 0) throw new RosterError("EMPTY");

  const plan = planRoster(rows, await repo.listExisting(year));
  return { year, rows, plan };
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
  if (!can(actor, "student:manage")) throw new Error("FORBIDDEN");

  const year = await getCurrentYear();
  const rows = buildExportRows(await repo.listExisting(year));
  return { year, rows };
}

/**
 * 확정 반영.
 *
 * 클라이언트가 돌려보낸 행을 **서버가 다시 분류한다.** 미리보기 결과를 그대로 믿으면
 * 중간에 손댄 값이 그대로 들어가고, 그 사이 DB가 바뀌었을 수도 있다.
 */
export async function applyRosterPlan(
  actor: SessionUser,
  expectedYear: number,
  rows: RosterRow[],
): Promise<{ saved: number; invites: Awaited<ReturnType<typeof repo.applyRoster>>["invites"] }> {
  assertMayImport(actor);

  const year = await getCurrentYear();
  if (year !== expectedYear) throw new RosterError("YEAR_CHANGED");

  const existing = await repo.listExisting(year);
  const plan = planRoster(rows, existing);
  if (plan.hasBlockingError) throw new RosterError("BLOCKED");

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
      removed: plan.missingFromFile.length,
    },
  });

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
      action: active ? "user:activate" : "user:deactivate",
      targetType: "User",
      targetId: userIdByProfile.get(a.studentProfileId!)!,
    });
  }

  return { saved: assignments.length, invites };
}
