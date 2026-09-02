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
import { planRoster, type ExistingStudent, type RosterPlan } from "./roster.plan";
import {
  issuePreviewToken,
  verifyPreviewToken,
} from "./roster.preview-token";
import * as repo from "./roster.repo";

export class RosterError extends Error {}

const INVITE_EXPIRES_DAYS = 90;

export function createRosterFingerprint(existing: ExistingStudent[]): string {
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
      s.removed,
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  return createHash("sha256").update(JSON.stringify(rows)).digest("base64url");
}

async function assertMayImport(actor: SessionUser): Promise<void> {
  await assertCan(actor, "student:manage");
  await assertCan(actor, "invite:create");
}

export async function previewRoster(
  actor: SessionUser,
  file: { filename: string; buffer: Buffer },
): Promise<{
  year: number;
  rows: RosterRow[];
  plan: RosterPlan;
  notices: string[];
  rosterFingerprint: string;
  previewToken: string;
}> {
  await assertMayImport(actor);

  const year = await getCurrentYear();
  const { rows, notices } = await parseRoster(file);
  if (rows.length === 0) throw new RosterError("EMPTY");

  const existing = await repo.listExisting(year);
  const plan = planRoster(rows, existing);
  const rosterFingerprint = createRosterFingerprint(existing);

  const previewToken = issuePreviewToken({
    year,
    rows,
    deletionIds: plan.missingFromFile.map((s) => s.studentProfileId),
    rosterFingerprint,
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "roster:preview",
    targetType: "AcademicYear",
    targetId: String(year),
    metadata: {
      year,
      fileRows: rows.length,
      existing: existing.length,
      missingFromFile: plan.missingFromFile.length,
    },
  });

  return { year, rows, plan, notices, rosterFingerprint, previewToken };
}

export async function exportRoster(
  actor: SessionUser,
): Promise<{ year: number; rows: (string | number | null)[][] }> {
  await assertCan(actor, "student:manage");

  const year = await getCurrentYear();
  const students = await repo.listForExport(year);
  const rows = buildExportRows(students);

  await recordAudit({
    actorUserId: actor.id,
    action: "roster:export",
    targetType: "AcademicYear",
    targetId: String(year),
    metadata: { year, count: students.length },
  });

  return { year, rows };
}

export async function applyRosterPlan(
  actor: SessionUser,
  expectedYear: number,
  rows: RosterRow[],
  expectedRosterFingerprint: string,
  confirmedDeletionIds: string[],
  deletionCountConfirmation: number | null,
  previewToken: string,
): Promise<{
  saved: number;
  invitesIssued: number;
  deleted: number;
  invites: Awaited<ReturnType<typeof repo.applyRoster>>["invites"];
  excludedNewStudents: { line: number; name: string; status: string | null }[];
}> {
  await assertMayImport(actor);

  if (rows.length === 0) throw new RosterError("EMPTY_ROWS");

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

  if (plan.missingFromFile.some((m) => m.userId === actor.id)) {
    throw new RosterError("CANNOT_DELETE_SELF");
  }

  const currentDeletionIds = new Set(plan.missingFromFile.map((m) => m.studentProfileId));
  const currentDeletionIdList = [...currentDeletionIds].sort();
  const confirmedDeletionIdList = [...confirmedDeletionIds].sort();
  const deletionSetMatches =
    currentDeletionIdList.length === confirmedDeletionIdList.length &&
    currentDeletionIdList.every((id, index) => id === confirmedDeletionIdList[index]);
  if (!deletionSetMatches) throw new RosterError("DELETION_SET_CHANGED");

  const deleteCount = plan.missingFromFile.length;
  if (deleteCount > 0 && deletionCountConfirmation !== deleteCount) {
    throw new RosterError("DELETION_COUNT_MISMATCH");
  }

  const userIdByProfile = new Map(existing.map((s) => [s.studentProfileId, s.userId]));
  const accountActiveByProfile = new Map(
    existing.map((s) => [s.studentProfileId, s.accountActive]),
  );
  const removedProfileIds = new Set(
    existing.filter((s) => s.removed).map((s) => s.studentProfileId),
  );

  const reassignedIds = new Set(plan.reassign.map((r) => r.studentProfileId));
  const statusChangedIds = new Set(plan.statusChange.map((r) => r.studentProfileId));
  const newAssignmentIds = new Set(plan.newAssignment.map((r) => r.studentProfileId));
  const missingIds = new Set(plan.missingFromFile.map((m) => m.studentProfileId));
  const restoredCount = plan.newAssignment.filter(
    (row) =>
      row.studentProfileId !== null &&
      removedProfileIds.has(row.studentProfileId),
  ).length;

  // 반·번호 교환을 위해 현재 학년도 배정 전체를 다시 만들므로 미변경 학생도 포함한다.
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

  const assignments: repo.RosterAssignment[] = [
    ...plan.reassign.map((r) => ({ ...r, statusChanged: false })),
    ...plan.statusChange.map((r) => ({ ...r, statusChanged: true })),
    ...plan.newAssignment.map((r) => ({ ...r, statusChanged: true })),
    ...untouched.map((r) => ({ ...r, statusChanged: false })),
  ];

  const locksOutSelf = assignments.some(
    (a) =>
      a.statusChanged &&
      a.status !== "ENROLLED" &&
      userIdByProfile.get(a.studentProfileId!) === actor.id,
  );
  if (locksOutSelf) throw new RosterError("CANNOT_DEACTIVATE_SELF");

  const eligibleNewStudents = plan.newStudents.filter((r) => r.status === "ENROLLED");

  const excludedNewStudents = plan.newStudents
    .filter((r) => r.status !== "ENROLLED")
    .map((r) => ({ line: r.line, name: r.name, status: r.status }));

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

        // 미리보기 뒤 변경뿐 아니라 잠금을 기다리는 동안의 변경도 거부한다.
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
            createdByName: actor.name,
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
            metadata: {
              year,
              reassign: plan.reassign.length,
              statusChange: plan.statusChange.length,
              newAssignment: plan.newAssignment.length,
              newStudents: plan.newStudents.length,
              invitesIssued: invites.length,
              excludedNew: excludedNewStudents.length,
              softDeleted: plan.missingFromFile.length,
              ...(restoredCount > 0 ? { restored: restoredCount } : {}),
            },
          },
          tx,
        );

        const entries: RecordAuditInput[] = [];

        for (const m of plan.missingFromFile) {
          entries.push({
            actorUserId: actor.id,
            actorName: actor.name,
            action: "user:soft-delete",
            targetType: "User",
            targetId: m.userId,
          });
        }

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
