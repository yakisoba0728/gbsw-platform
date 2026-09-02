import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import {
  DECIDABLE_STATUSES,
  isPassStatus,
  PASS_STATUSES,
  requiresConsent,
  type PassStatus,
} from "@/core/authz/pass-type";
import { withTransaction } from "@/core/db/client";
import { formatDateInput } from "@/lib/datetime";
import { parseStudentNumber } from "@/lib/student-number";
import { PassError } from "./pass.error";
import { toPassHistorySheet, type PassHistoryExportRow } from "./pass.export";
import * as repo from "./pass.repo";
import type { PassHistoryFilter, PassWithStudent } from "./pass.repo";
import {
  PASS_HISTORY_PAGE_SIZE,
  passHistoryRange,
  type ApprovePassInput,
  type CancelPassInput,
  type IssuePassInput,
  type PassHistoryExportInput,
  type PassHistoryQuery,
  type RejectPassInput,
} from "./pass.schema";
import { conflictWindow, issueWindow } from "./pass.window";

const CANCELLABLE: readonly PassStatus[] = ["REQUESTED", "CONSENTED", "APPROVED"];

export async function approvePass(
  actor: SessionUser,
  input: ApprovePassInput,
  now: Date = new Date(),
): Promise<void> {
  await assertCan(actor, "pass:approve");

  const pass = await repo.findPass(input.passId);
  if (!pass) throw new PassError("PASS_NOT_FOUND");
  if (pass.endAt.getTime() <= now.getTime()) throw new PassError("PASS_EXPIRED");

  const consented = pass.consentedAt !== null || pass.consentByProxy;
  const needsConsent = requiresConsent(pass.type) && !consented;
  const requestedProxy = needsConsent && input.byProxy === "on";

  if (needsConsent && !requestedProxy) {
    throw new PassError("CONSENT_REQUIRED");
  }

  await withTransaction(async (tx) => {
    const decisionFields = {
      status: "APPROVED" as const,
      decidedByUserId: actor.id,
      decidedByName: actor.name,
      decidedAt: now,
    };
    let byProxy = false;
    let decisionNote = input.decisionNote ?? input.consentNote ?? null;
    let consentNote: string | null = null;
    let outcome: repo.UnexpiredTransitionOutcome;

    if (requestedProxy) {
      decisionNote = null;
      consentNote = input.consentNote ?? null;
      outcome = await repo.transitionUnexpired(
        input.passId,
        ["REQUESTED"],
        {
          ...decisionFields,
          decisionNote,
          consentByProxy: true,
          consentedByUserId: actor.id,
          consentedByName: actor.name,
          consentedAt: now,
          consentNote,
        },
        tx,
      );
      byProxy = outcome === "UPDATED";

      if (outcome === "UNCHANGED") {
        consentNote = null;
        outcome = await repo.transitionUnexpired(
          input.passId,
          ["CONSENTED"],
          { ...decisionFields, decisionNote },
          tx,
        );
      }
    } else {
      outcome = await repo.transitionUnexpired(
        input.passId,
        DECIDABLE_STATUSES,
        { ...decisionFields, decisionNote },
        tx,
      );
    }

    if (outcome === "EXPIRED") throw new PassError("PASS_EXPIRED");
    if (outcome !== "UPDATED") throw new PassError("ALREADY_DECIDED");

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "pass:approve",
        targetType: "Pass",
        targetId: input.passId,
        metadata: {
          type: pass.type,
          byProxy,
          startAt: pass.startAt.toISOString(),
          endAt: pass.endAt.toISOString(),
          decisionNote,
          consentNote,
        },
      },
      tx,
    );
  });
}

export async function rejectPass(
  actor: SessionUser,
  input: RejectPassInput,
): Promise<void> {
  await assertCan(actor, "pass:approve");

  const pass = await repo.findPass(input.passId);
  if (!pass) throw new PassError("PASS_NOT_FOUND");

  await withTransaction(async (tx) => {
    const changed = await repo.transition(
      input.passId,
      DECIDABLE_STATUSES,
      {
        status: "REJECTED",
        decidedByUserId: actor.id,
        decidedByName: actor.name,
        decidedAt: new Date(),
        decisionNote: input.decisionNote,
      },
      tx,
    );
    if (changed === 0) throw new PassError("ALREADY_DECIDED");

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "pass:reject",
        targetType: "Pass",
        targetId: input.passId,
        metadata: { type: pass.type, reason: input.decisionNote },
      },
      tx,
    );
  });
}

export async function issuePass(
  actor: SessionUser,
  input: IssuePassInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  await assertCan(actor, "pass:issue");

  // 잠금 대기가 자정을 넘어도 제출한 종료 날짜를 유지한다.
  const { endAt } = issueWindow(input, now);

  try {
    return await withTransaction(
      async (tx) => {
        const year = await repo.findCurrentYearForUpdate(tx);
        const eligible =
          year !== null &&
          (await repo.lockEligibleStudentForPassCreation(input.studentId, year, tx));
        if (!eligible) throw new PassError("STUDENT_NOT_ELIGIBLE");

        // 잠금 후 DB 시각을 사용해 이미 끝난 기간의 발급을 막는다.
        const issuedAt = await repo.currentDatabaseTime(tx);
        if (endAt.getTime() <= issuedAt.getTime()) {
          throw new PassError("PASS_EXPIRED");
        }
        const startAt = issuedAt;

        const consentFields =
          input.type === "OVERNIGHT"
            ? {
                consentByProxy: true,
                consentedByUserId: actor.id,
                consentedByName: actor.name,
                consentedAt: issuedAt,
                consentNote: input.consentNote,
              }
            : {};

        const conflict = conflictWindow({ startAt, endAt });
        const overlapping = await repo.findOverlapping(
          input.studentId,
          conflict.startAt,
          conflict.endAt,
          tx,
        );
        if (overlapping) throw new PassError("OVERLAPPING_PASS");

        const created = await repo.createPass(
          {
            studentProfileId: input.studentId,
            type: input.type,
            status: "APPROVED",
            startAt,
            endAt,
            destination: input.destination,
            reason: input.reason,
            requestedByUserId: actor.id,
            requestedByName: actor.name,
            decidedByUserId: actor.id,
            decidedByName: actor.name,
            decidedAt: issuedAt,
            ...consentFields,
          },
          tx,
        );

        await recordAudit(
          {
            actorUserId: actor.id,
            actorName: actor.name,
            action: "pass:issue",
            targetType: "Pass",
            targetId: created.id,
            metadata: {
              type: input.type,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
              destination: input.destination,
              byProxy: input.type === "OVERNIGHT",
            },
          },
          tx,
        );

        return created;
      },
      // 명단 반영의 최대 120초 잠금 대기를 허용한다.
      { timeout: 130_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2028"
    ) {
      throw new PassError("PASS_BUSY");
    }
    throw error;
  }
}

export async function cancelPass(
  actor: SessionUser,
  input: CancelPassInput,
): Promise<void> {
  await assertCan(actor, "pass:cancel");

  const pass = await repo.findPass(input.passId);
  if (!pass) throw new PassError("PASS_NOT_FOUND");

  await withTransaction(async (tx) => {
    const changed = await repo.transition(
      input.passId,
      CANCELLABLE,
      {
        status: "CANCELLED",
        cancelledByUserId: actor.id,
        cancelledByName: actor.name,
        cancelledAt: new Date(),
        cancelReason: input.reason,
      },
      tx,
    );
    if (changed === 0) throw new PassError("ALREADY_CANCELLED");

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "pass:cancel",
        targetType: "Pass",
        targetId: input.passId,
        metadata: { type: pass.type, byOwner: false, reason: input.reason },
      },
      tx,
    );
  });
}

export async function listPendingPasses(actor: SessionUser, now: Date = new Date()) {
  await assertCan(actor, "pass:read:any");
  return repo.listPendingForAdmin(now, await repo.displayYear());
}

export async function listActivePasses(actor: SessionUser, now: Date = new Date()) {
  await assertCan(actor, "pass:read:any");
  return repo.listActiveNow(now, await repo.displayYear());
}

export async function listStudentsForIssue(actor: SessionUser) {
  await assertCan(actor, "pass:issue");
  return repo.listEnrolledStudents(await repo.displayYear());
}

function historyFilter(
  query: PassHistoryExportInput & { studentProfileId?: string },
  range: { since: Date; until: Date | null },
): PassHistoryFilter {
  return {
    type: query.type,
    status: query.status,
    q: query.q,
    studentNumber: query.q ? (parseStudentNumber(query.q) ?? undefined) : undefined,
    studentProfileId: query.studentProfileId,
    since: query.studentProfileId && !query.from ? undefined : range.since,
    until: range.until,
  };
}

export async function listPassHistory(actor: SessionUser, query: PassHistoryQuery) {
  await assertCan(actor, "pass:read:any");

  const year = await repo.displayYear();
  const { entries, total } = await repo.listHistory(
    {
      ...historyFilter(query, passHistoryRange(query)),
      skip: (query.page - 1) * PASS_HISTORY_PAGE_SIZE,
      take: PASS_HISTORY_PAGE_SIZE,
    },
    year,
  );

  return {
    entries,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / PASS_HISTORY_PAGE_SIZE)),
  };
}

export async function countStudentPasses(
  actor: SessionUser,
  studentProfileId: string,
): Promise<{ byStatus: Record<PassStatus, number>; total: number }> {
  await assertCan(actor, "pass:read:any");

  const byStatus = Object.fromEntries(
    PASS_STATUSES.map((status) => [status, 0]),
  ) as Record<PassStatus, number>;

  let total = 0;
  for (const row of await repo.countStatusesForStudent(studentProfileId)) {
    total += row.count;
    if (isPassStatus(row.status)) byStatus[row.status] = row.count;
  }

  return { byStatus, total };
}

export async function exportPassHistory(
  actor: SessionUser,
  input: PassHistoryExportInput,
): Promise<{ rows: (string | number)[][]; filename: string }> {
  await assertCan(actor, "pass:read:any");

  const year = await repo.displayYear();
  const range = passHistoryRange(input);
  const { entries } = await repo.listHistory(
    { ...historyFilter(input, range), skip: 0, take: null },
    year,
  );

  return {
    rows: toPassHistorySheet(entries.map(toExportRow), input, range),
    filename: historyFilename(range),
  };
}

function historyFilename(range: { since: Date; until: Date | null }): string {
  const from = formatDateInput(range.since);
  return range.until
    ? `출입증내역_${from}~${formatDateInput(new Date(range.until.getTime() - 1))}.xlsx`
    : `출입증내역_${from}부터.xlsx`;
}

function toExportRow(pass: PassWithStudent): PassHistoryExportRow {
  const enrollment = pass.studentProfile.enrollments[0];

  return {
    type: pass.type,
    status: pass.status,
    grade: enrollment?.grade ?? null,
    classNo: enrollment?.classNo ?? null,
    number: enrollment?.number ?? null,
    studentName: pass.studentProfile.user.name,
    startAt: pass.startAt,
    endAt: pass.endAt,
    destination: pass.destination,
    reason: pass.reason,
    requestedByName: pass.requestedByName,
    consentedByName: pass.consentedByName,
    consentedAt: pass.consentedAt,
    consentByProxy: pass.consentByProxy,
    consentNote: pass.consentNote,
    decidedByName: pass.decidedByName,
    decidedAt: pass.decidedAt,
    decisionNote: pass.decisionNote,
    cancelledByName: pass.cancelledByName,
    cancelledAt: pass.cancelledAt,
    cancelReason: pass.cancelReason,
  };
}
