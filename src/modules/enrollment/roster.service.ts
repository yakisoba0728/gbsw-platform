import { createHash } from "node:crypto";
import {
  recordAudit,
  recordAuditMany,
  type RecordAuditInput,
} from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import { isSerializationConflict } from "@/core/db/transaction-conflict";
import { generateUniqueCode, toExpiresAt } from "@/modules/invites/invite.service";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import { buildExportRows } from "./roster.export";
import { parseRoster, type RosterRow } from "./roster.parse";
import { planRoster, type RosterPlan } from "./roster.plan";
import {
  issuePreviewToken,
  verifyPreviewToken,
} from "./roster.preview-token";
import * as repo from "./roster.repo";

export class RosterError extends Error {}

/** 종이로 나눠주는 코드다. 무기한이면 잃어버린 종이가 영원히 유효하다. */
const INVITE_EXPIRES_DAYS = 90;

type RosterFingerprintStudent = {
  studentProfileId: string;
  userId: string;
  studentCode: string;
  name: string;
  birthDate: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: string | null;
  hasGraduatedEnrollment: boolean;
  accountActive: boolean;
};

export function createRosterFingerprint(existing: RosterFingerprintStudent[]): string {
  const rows = existing
    .map((s) => [
      s.studentProfileId,
      s.userId,
      s.studentCode,
      s.name,
      s.birthDate,
      s.grade,
      s.classNo,
      s.number,
      s.status,
      s.hasGraduatedEnrollment,
      s.accountActive,
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  return createHash("sha256").update(JSON.stringify(rows)).digest("base64url");
}

async function assertMayImport(actor: SessionUser): Promise<void> {
  // 소속을 바꾸고 초대코드도 만든다. 둘 다 확인한다.
  await assertCan(actor, "student:manage");
  await assertCan(actor, "invite:create");
}

/** 미리보기. **아무것도 저장하지 않는다.** */
export async function previewRoster(
  actor: SessionUser,
  file: { filename: string; buffer: Buffer },
): Promise<{
  year: number;
  rows: RosterRow[];
  plan: RosterPlan;
  notices: string[];
  rosterFingerprint: string;
  /** 이 미리보기를 봉인한 값. 확정은 이걸 그대로 되돌려 보내야 한다. */
  previewToken: string;
}> {
  await assertMayImport(actor);

  const year = await getCurrentYear();
  const { rows, notices } = await parseRoster(file);
  if (rows.length === 0) throw new RosterError("EMPTY");

  const existing = await repo.listExisting(year);
  const plan = planRoster(rows, existing);
  const rosterFingerprint = createRosterFingerprint(existing);

  // 봉인은 여기서 찍는다 — 확정 쪽 검증과 짝이므로 둘이 같은 계층에 있어야
  // 진입점이 바뀌어도 함께 따라간다.
  const previewToken = issuePreviewToken({
    year,
    rows,
    deletionIds: plan.missingFromFile.map((s) => s.studentProfileId),
    rosterFingerprint,
  });

  return { year, rows, plan, notices, rosterFingerprint, previewToken };
}

/**
 * 전체 명단 내보내기.
 *
 * **읽기지만 기록을 남긴다.** 전교생의 이름·생년월일·학생코드가 한 번에 파일로
 * 나가는 유일한 경로라, 교사 계정 하나가 털렸을 때 「누가 언제 명단을 통째로
 * 받았나」에 답할 자료가 여기밖에 없다. 남기는 것은 학년도와 건수뿐이다 —
 * 이름을 실으면 감사로그 자체가 명단 사본이 된다.
 */
export async function exportRoster(
  actor: SessionUser,
): Promise<{ year: number; rows: (string | number | null)[][] }> {
  await assertCan(actor, "student:manage");

  const year = await getCurrentYear();
  const existing = await repo.listExisting(year);
  // legacy deletedAt 표시가 남은 계정은 listExisting()에서 이미 빠진다.
  const students = existing.filter((s) => !s.deleted);
  const rows = buildExportRows(students);

  await recordAudit({
    actorUserId: actor.id,
    action: "roster:export",
    targetType: "AcademicYear",
    targetId: String(year),
    // 머리글 줄은 빼고 학생 수만 센다.
    metadata: { year, count: students.length },
  });

  return { year, rows };
}

/**
 * 확정 반영. 클라이언트가 돌려보낸 행을 서버가 다시 분류한다.
 *
 * 삭제 확인은 둘이 함께 한다 — `confirmedDeletionIds`는 화면이 본 삭제 대상
 * 집합(동의 표시가 아니다), `deletionCountConfirmation`은 교사가 적은 인원 수다.
 */
export async function applyRosterPlan(
  actor: SessionUser,
  expectedYear: number,
  rows: RosterRow[],
  expectedRosterFingerprint: string,
  confirmedDeletionIds: string[],
  deletionCountConfirmation: number | null,
  /** previewRoster가 준 봉인. 이것이 곧 「미리보기에서 본 그 행인가」의 답이다. */
  previewToken: string,
): Promise<{
  saved: number;
  invitesIssued: number;
  deleted: number;
  invites: Awaited<ReturnType<typeof repo.applyRoster>>["invites"];
  /** 신규로 잡혔지만 재학이 아니라 아무것도 만들어지지 않은 줄. 화면이 따로 알린다. */
  excludedNewStudents: { line: number; name: string; status: string | null }[];
}> {
  await assertMayImport(actor);

  // 경계 zod를 건너뛴 진입점이 생겨도 rows: []로 전교생이 삭제 대상이 되면 안 된다.
  if (rows.length === 0) throw new RosterError("EMPTY_ROWS");

  // 아래 검사들은 「DB 쪽 명단이 그대로인가」를 본다. 넘어온 행 자체가 교사가
  // 화면에서 확인한 그 행인지는 이 봉인만 답할 수 있다.
  if (
    !verifyPreviewToken(previewToken, {
      year: expectedYear,
      rows,
      deletionIds: confirmedDeletionIds,
      rosterFingerprint: expectedRosterFingerprint,
    })
  ) {
    throw new RosterError("PREVIEW_TOKEN_INVALID");
  }

  const year = await getCurrentYear();
  if (year !== expectedYear) throw new RosterError("YEAR_CHANGED");

  const existing = await repo.listExisting(year);
  if (createRosterFingerprint(existing) !== expectedRosterFingerprint) {
    throw new RosterError("ROSTER_CHANGED");
  }
  const plan = planRoster(rows, existing);
  if (plan.hasBlockingError) throw new RosterError("BLOCKED");

  // 자기 계정이 삭제 대상에 들어가면 거부한다.
  if (plan.missingFromFile.some((m) => m.userId === actor.id)) {
    throw new RosterError("CANNOT_DELETE_SELF");
  }

  // 미리보기가 보여준 삭제 대상과 지금 다시 세운 대상이 같은 집합이어야 한다.
  // 하나라도 다르면 교사가 본 화면과 지금이 다르다는 뜻이다.
  const currentDeletionIds = new Set(plan.missingFromFile.map((m) => m.studentProfileId));
  const currentDeletionIdList = [...currentDeletionIds].sort();
  const confirmedDeletionIdList = [...confirmedDeletionIds].sort();
  const deletionSetMatches =
    currentDeletionIdList.length === confirmedDeletionIdList.length &&
    currentDeletionIdList.every((id, index) => id === confirmedDeletionIdList[index]);
  if (!deletionSetMatches) throw new RosterError("DELETION_SET_CHANGED");

  // 삭제 대상이 하나라도 있으면 교사가 적은 건수가 서버가 센 건수와 같아야 한다.
  const deleteCount = plan.missingFromFile.length;
  if (deleteCount > 0 && deletionCountConfirmation !== deleteCount) {
    throw new RosterError("DELETION_COUNT_MISMATCH");
  }

  const userIdByProfile = new Map(existing.map((s) => [s.studentProfileId, s.userId]));
  const accountActiveByProfile = new Map(
    existing.map((s) => [s.studentProfileId, s.accountActive]),
  );

  // repo가 그 학년도 배정을 통째로 지우고 새로 넣는다(번호 맞바꾸기를 update로는
  // 못 한다 — 유일 제약이 DEFERRABLE이 아니다). 안 바뀐 학생도 함께 넘겨야 한다.
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

  // 학적이 실제로 달라진 항목만 계정 상태를 건드린다(statusChanged).
  const assignments: repo.RosterAssignment[] = [
    ...plan.reassign.map((r) => ({ ...r, statusChanged: false })),
    ...plan.statusChange.map((r) => ({ ...r, statusChanged: true })),
    ...plan.newAssignment.map((r) => ({ ...r, statusChanged: true })),
    ...untouched.map((r) => ({ ...r, statusChanged: false })),
  ];

  // 자기 자신을 비활성으로 돌리는 반영은 스스로를 영구 로그아웃시킨다.
  const locksOutSelf = assignments.some(
    (a) =>
      a.statusChanged &&
      a.status !== "ENROLLED" &&
      userIdByProfile.get(a.studentProfileId!) === actor.id,
  );
  if (locksOutSelf) throw new RosterError("CANNOT_DEACTIVATE_SELF");

  // 비재학 신규 줄은 초대코드를 만들지 않는다 — 가입 대조가 학년·반·번호를 요구해서
  // 코드를 만들어도 가입이 영원히 막힌다.
  const eligibleNewStudents = plan.newStudents.filter((r) => r.status === "ENROLLED");

  // 걸러낸 줄은 확정해도 아무것도 안 생기고 오류도 안 난다. 어느 줄인지까지 돌려준다.
  const excludedNewStudents = plan.newStudents
    .filter((r) => r.status !== "ENROLLED")
    .map((r) => ({ line: r.line, name: r.name, status: r.status }));

  // Set이 이번 배치 안의 중복까지 막는다 — generateUniqueCode()는 아직 커밋되지 않은
  // 같은 배치의 다른 코드를 볼 수 없다.
  const codes = new Set<string>();
  while (codes.size < eligibleNewStudents.length) {
    codes.add(await generateUniqueCode());
  }
  const codeList = [...codes];
  const newStudents = eligibleNewStudents.map((row, i) => ({ row, code: codeList[i]! }));

  let applied: Awaited<ReturnType<typeof repo.applyRoster>>;
  try {
    applied = await withTransaction(
      async (tx) => {
        const currentYear = await repo.findCurrentYearForUpdate(tx);
        if (currentYear !== expectedYear) {
          throw new RosterError("YEAR_CHANGED");
        }

        const currentInTransaction = await repo.listExisting(year, tx);
        if (createRosterFingerprint(currentInTransaction) !== expectedRosterFingerprint) {
          throw new RosterError("ROSTER_CHANGED");
        }

        const result = await repo.applyRoster(
          year,
          {
            assignments,
            newStudents,
            inviteExpiresAt: toExpiresAt(INVITE_EXPIRES_DAYS),
            managedStudentProfileIds: existing.map((s) => s.studentProfileId),
            deleteStudentProfileIds: currentDeletionIdList,
            createdById: actor.id,
          },
          tx,
        );
        const { invites, revokedInvites } = result;

        await recordAudit(
          {
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
              excludedNew: excludedNewStudents.length,
              deleted: plan.missingFromFile.length,
            },
          },
          tx,
        );

        // 아래 네 갈래는 한 번에 남긴다. 이 트랜잭션이 AcademicYear 잠금을 쥐고
        // 있는 동안 전교의 상벌점 부여가 멈추므로, 왕복 수를 줄이는 것이 곧
        // 정지 구간을 줄이는 일이다. actorName을 넘겨 이름 재조회도 없앤다.
        const entries: RecordAuditInput[] = [];

        // 명단에서 빠진 학생마다 한 줄. userId만 담는다 — 이름을 넣으면 감사로그가
        // 개인정보 사본이 된다.
        for (const m of plan.missingFromFile) {
          entries.push({
            actorUserId: actor.id,
            actorName: actor.name,
            action: "user:delete",
            targetType: "User",
            targetId: m.userId,
          });
        }

        // 함께 지워진 초대코드마다 한 줄. 코드 값 자체는 남기지 않는다.
        // 대기분만이 아니다 — 소진된 코드도 함께 지워지므로 status로 구분한다.
        for (const invite of revokedInvites) {
          entries.push({
            actorUserId: actor.id,
            actorName: actor.name,
            action: "invite:revoke:roster",
            targetType: "Invite",
            targetId: invite.id,
            metadata: { role: invite.role, status: invite.status },
          });
        }

        // 이번 반영이 새로 낸 초대코드마다 한 줄. 단건 발급 경로가 남기는 것과
        // 같은 액션이다 — 종이로 나가는 코드가 어디서 나왔든 발급 기록은 하나여야
        // 「이 코드는 누가 만들었나」를 한 줄로 되짚을 수 있다.
        // **코드 값은 metadata에 넣지 않는다.** 감사로그를 볼 수 있는 사람이
        // 남의 가입코드를 그대로 읽게 된다.
        for (const invite of invites) {
          entries.push({
            actorUserId: actor.id,
            actorName: actor.name,
            action: "invite:create",
            targetType: "Invite",
            targetId: invite.id,
            metadata: { role: "STUDENT" },
          });
        }

        // 계정 상태가 실제로 뒤집힐 때만 한 줄 더. targetId는 userId여야
        // 계정 상세의 활동 기록(findRelatedAudit)이 이 줄을 찾는다.
        for (const a of assignments) {
          if (!a.statusChanged) continue;
          const before = accountActiveByProfile.get(a.studentProfileId!);
          const active = a.status === "ENROLLED";
          if (before === undefined || before === active) continue;

          entries.push({
            actorUserId: actor.id,
            actorName: actor.name,
            action: active ? "user:activate" : "user:deactivate",
            targetType: "User",
            targetId: userIdByProfile.get(a.studentProfileId!)!,
          });
        }

        await recordAuditMany(entries, tx);

        return result;
      },
      { timeout: 120_000, maxWait: 10_000, isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof repo.InviteCodeCollisionError) {
      throw new RosterError("CODE_COLLISION");
    }
    // 파일 안의 자리 겹침은 planRoster가 이미 걸렀다. 여기까지 오는 것은 명단 밖
    // 계정이 붙들고 있는 (반, 번호)뿐이라 파일을 고쳐도 풀리지 않는다 — 화면이
    // 그 사실을 말해야 교사가 엉뚱한 곳을 고치지 않는다.
    if (error instanceof repo.NumberTakenError) {
      throw new RosterError("NUMBER_TAKEN");
    }
    if (isSerializationConflict(error)) {
      const currentYear = await repo.findCurrentYear();
      throw new RosterError(currentYear === expectedYear ? "ROSTER_CHANGED" : "YEAR_CHANGED");
    }
    throw error;
  }
  const { invites } = applied;

  // deleted는 화면이 "N명 제외"를 따로 알리는 데 쓴다 — 반영 건수 하나만 주면
  // 몇 명이 명단에서 빠졌는지가 묻힌다.
  return {
    saved:
      plan.reassign.length +
      plan.statusChange.length +
      plan.newAssignment.length,
    invitesIssued: invites.length,
    deleted: plan.missingFromFile.length,
    invites,
    excludedNewStudents,
  };
}
