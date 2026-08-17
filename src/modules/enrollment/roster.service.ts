import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
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
  const existing = await repo.listExisting(year);
  // 명단에서 빠져 소프트 삭제된 학생은 내려받는 파일에도 나오면 안 된다 — 더는
  // 재적 학생이 아니다. listExisting()이 매칭을 위해 이들을 계속 들고 있으므로
  // (roster.repo.ts 주석 참고) 여기서 걸러낸다.
  const rows = buildExportRows(existing.filter((s) => !s.deleted));
  return { year, rows };
}

/**
 * 확정 반영.
 *
 * 클라이언트가 돌려보낸 행을 **서버가 다시 분류한다.** 미리보기 결과를 그대로 믿으면
 * 중간에 손댄 값이 그대로 들어가고, 그 사이 DB가 바뀌었을 수도 있다.
 *
 * 삭제 확인은 두 값이 함께 한다 — **무엇을 지우는지**(confirmedDeletionIds)와
 * **몇 명을 지우는지**(deletionCountConfirmation)다.
 *
 * `confirmedDeletionIds`는 미리보기가 관리자에게 보여준 삭제 대상(missingFromFile)의
 * studentProfileId 목록이다 — boolean 플래그가 아니라 **집합**을 받는 이유는, 확정
 * 시점에 서비스가 삭제 대상을 다시 계산하기 때문이다(I-2). 그 사이 DB가 바뀌면(예:
 * 파일에 없던 학생이 초대코드로 막 가입해 새 StudentProfile이 생기면) boolean만으로는
 * "삭제에 동의했다"는 사실과 "무엇을 보고 동의했는지"를 구분할 수 없어, 관리자가 본
 * 적 없는 학생이 조용히 삭제될 수 있다. 서비스가 다시 세운 집합과 이 목록을 대조해
 * 다르면 거부한다 — **화면이 그 시점에 실제로 본 목록**이라는 뜻이지, 관리자의 동의
 * 표시가 아니다(동의는 아래 건수가 받는다).
 *
 * `deletionCountConfirmation`은 관리자가 직접 센 삭제 인원이다(I-3). 삭제 대상이
 * 하나라도 있으면 **항상** 요구한다 — 잘못된 파일(다른 학년만 담긴 파일, 다른 학교
 * 파일)을 올렸을 때 마지막 방어선이 되어야 하는데, 예전처럼 임계 초과에서만 물으면
 * 학교가 클수록 임계도 커져 정작 한 반이 통째로 빠진 파일을 그냥 지나쳤다.
 *
 * 되돌릴 수 없는 유일한 동작이라 화면 입력칸만이 아니라 서버가 다시 강제한다.
 * 서버 액션을 직접 호출하면 화면의 확인 절차는 건너뛸 수 있기 때문이다.
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
  /**
   * 신규로 잡혔지만 재학이 아니라 **아무것도 만들어지지 않은** 줄 (I1).
   * 미리보기는 이들을 "신규 N"으로 세므로 결과에 드러나지 않으면 관리자가
   * N명이 등록됐다고 믿는다. 화면이 "제외 N건"으로 보여줄 자료다.
   */
  excludedNewStudents: { line: number; name: string; status: string | null }[];
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
  // 집합이어야 한다. 순서·중복은 의미가 없으므로 Set으로 비교한다 — 지울 사람이
  // 하나라도 다르면 관리자가 본 화면과 지금이 다르다는 뜻이다. 화면은 삭제 대상이
  // 있으면 목록을 그대로 실어 보내므로, 빈 배열이 오는데 삭제 대상이 있다면 화면을
  // 거치지 않은 요청이다 — 그것도 여기서 걸린다.
  const currentDeletionIds = new Set(plan.missingFromFile.map((m) => m.studentProfileId));
  const confirmedSet = new Set(confirmedDeletionIds);
  const deletionSetMatches =
    currentDeletionIds.size === confirmedSet.size &&
    [...currentDeletionIds].every((id) => confirmedSet.has(id));
  if (!deletionSetMatches) throw new RosterError("DELETION_SET_CHANGED");

  // I-3: 삭제 대상이 **하나라도** 있으면 관리자가 직접 입력한 건수가 서버가 다시 센
  // 건수와 정확히 같아야 한다.
  //
  // 예전에는 "10명 또는 재학생의 10% 중 큰 쪽"을 넘을 때만 물었다. 그 임계는 학교가
  // 클수록 함께 커져서 정작 큰 사고를 놓쳤다 — 재학 300명이면 임계가 30이라 한 반
  // (25명)이 통째로 빠진 잘못된 파일이 체크박스 하나로 확정됐다. 임계를 낮추는 대신
  // 없앴다: 삭제는 되돌릴 수 없는 쪽에 가장 가까운 동작이고, 정상적인 학기말 정리라면
  // 관리자는 몇 명을 빼는지 이미 알고 있어 숫자 하나 적는 것이 부담이 되지 않는다.
  const deleteCount = plan.missingFromFile.length;
  if (deleteCount > 0 && deletionCountConfirmation !== deleteCount) {
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

  // 걸러낸 줄은 **반환값과 감사로그 양쪽에 드러낸다.** 이 줄들은 assignments에도
  // 못 들어간다(studentProfileId가 null이라 만들 배정이 없다) — 즉 확정해도
  // 아무것도 안 생기고 오류도 안 난다. 미리보기는 이들을 "신규 N"으로 세므로,
  // 결과에 드러내지 않으면 관리자는 N명이 등록됐다고 믿는다. 몇 건인지만이 아니라
  // 어느 줄인지까지 준다 — 파일을 고치려면 누가 빠졌는지 알아야 한다.
  const excludedNewStudents = plan.newStudents
    .filter((r) => r.status !== "ENROLLED")
    .map((r) => ({ line: r.line, name: r.name, status: r.status }));

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
  const { invites, revokedInvites } = applied;

  // 이번 반영으로 되살아난(deletedAt이 지워진) 학생 수 — 이미 소프트 삭제됐던
  // studentProfileId가 다시 배정을 받았다는 뜻이다. "다시 넣으면 돌아온다"는 사실이
  // 배치 요약에도 보이도록 별도로 센다 (개별 학생 단위 감사로그는 statusChanged가
  // 실제로 뒤집힐 때만 남는 user:activate/deactivate가 있고, 그 반대의 경우 —
  // 예: 졸업생으로 돌아와 비활성이 유지되는 경우 — 는 이 배치 요약이 유일한 흔적이다).
  const revivedProfileIds = new Set(
    existing.filter((s) => s.deleted).map((s) => s.studentProfileId),
  );
  const restored = assignments.filter(
    (a) => a.statusChanged && revivedProfileIds.has(a.studentProfileId!),
  ).length;

  await recordAudit({
    actorUserId: actor.id,
    action: "enrollment:import",
    targetType: "AcademicYear",
    targetId: String(year),
    // 건수만 남긴다. 학생 이름·소속이 들어가면 감사로그가 명단 사본이 된다.
    // 필드 이름은 softDeleted다 — 계정을 지우지 않고 표시만 하므로 예전 이름
    // deleted를 그대로 쓰면 사실과 어긋난다. 옛 감사로그 행은 deleted로 저장돼
    // 있으므로 audit-log.labels.ts의 IMPORT_COUNT_LABELS는 두 키를 다 안다.
    metadata: {
      year,
      reassign: plan.reassign.length,
      statusChange: plan.statusChange.length,
      newAssignment: plan.newAssignment.length,
      newStudents: plan.newStudents.length,
      invitesIssued: invites.length,
      // 신규로 잡혔지만 재학이 아니라 아무것도 만들어지지 않은 줄 수. 이름은
      // 여기 남기지 않는다 — 반환값이 화면에 그 목록을 따로 준다.
      excludedNew: excludedNewStudents.length,
      softDeleted: plan.missingFromFile.length,
      restored,
    },
  });

  // 명단에서 빠져 소프트 삭제된 학생마다 한 줄씩 남긴다. targetId(userId)만 담는다 —
  // 이름을 넣으면 감사로그가 삭제된 학생의 개인정보 사본이 된다. 누가 뺐는지는
  // actorName이 남긴다.
  //
  // actorName을 미리 넘긴다 (M8) — 안 넘기면 recordAudit이 호출마다 이름을
  // 다시 조회한다. 275명 삭제 = 275회 순차 왕복이 되어 리버스 프록시
  // 타임아웃에 걸릴 수 있다. actor(SessionUser)에 이미 이름이 있다 —
  // 선택적 최적화 경로일 뿐, 안 넘기는 호출부는 여전히 정상 동작한다.
  for (const m of plan.missingFromFile) {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "user:soft-delete",
      targetType: "User",
      targetId: m.userId,
    });
  }

  // 명단에서 빠지면서 함께 폐기된 미사용 초대코드마다 한 줄씩 남긴다.
  // registration.service.ts가 invite:auto-revoke를 추가한 것과 정확히 같은 이유다 —
  // 코드가 조용히 죽으면 "왜 이 코드가 안 되느냐"는 물음에 답할 자료가 아무 데도
  // 없다. 감사로그는 **트랜잭션이 커밋된 뒤에만** 남긴다(이 저장소의 관례).
  // 코드 값 자체는 남기지 않는다 — invite:create와 같은 처리다.
  for (const invite of revokedInvites) {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "invite:revoke:roster",
      targetType: "Invite",
      targetId: invite.id,
      metadata: { role: invite.role },
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

  // deleted도 감사로그 metadata의 softDeleted와 같은 값(plan.missingFromFile.length)에서
  // 나온다 — 반영 건수만 보여주면 "250건 반영했습니다" 뒤에 50명이 명단에서 빠졌다는
  // 사실이 묻힌다 (Minor-4). 반환 필드 이름(deleted)은 그대로 둔다 — 화면(ApplyState)이
  // 쓰는 내부 계약이라 감사로그처럼 사용자에게 "삭제"라고 보여주지 않는다(문구는
  // import-form.tsx가 따로 정한다).
  return {
    saved: assignments.length,
    deleted: plan.missingFromFile.length,
    invites,
    excludedNewStudents,
  };
}
