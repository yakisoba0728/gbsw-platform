import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import {
  DECIDABLE_STATUSES,
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
import { issueWindow } from "./pass.window";

/** 교사 쪽 경로. 교직원 사이에 권한 차등이 없어 소유권 검사가 없다. */

/** 취소가 가능한 상태. 승인된 것을 무르는 일이 여기 있다. */
const CANCELLABLE: readonly PassStatus[] = ["REQUESTED", "CONSENTED", "APPROVED"];

export async function approvePass(
  actor: SessionUser,
  input: ApprovePassInput,
): Promise<void> {
  await assertCan(actor, "pass:approve");

  const pass = await repo.findPass(input.passId);
  if (!pass) throw new PassError("PASS_NOT_FOUND");

  const byProxy = input.byProxy === "on";
  const consented = pass.consentedAt !== null || pass.consentByProxy;

  // 외박의 APPROVED 전이는 보호자 확인이 있을 때만. 대행이 그 자리를 대신한다.
  if (requiresConsent(pass.type) && !consented && !byProxy) {
    throw new PassError("CONSENT_REQUIRED");
  }

  const now = new Date();
  const proxyFields = byProxy
    ? {
        consentByProxy: true,
        consentedByUserId: actor.id,
        consentedByName: actor.name,
        consentedAt: now,
        consentNote: input.consentNote,
      }
    : {};

  await withTransaction(async (tx) => {
    const changed = await repo.transition(
      input.passId,
      DECIDABLE_STATUSES,
      {
        status: "APPROVED",
        decidedByUserId: actor.id,
        decidedByName: actor.name,
        decidedAt: now,
        decisionNote: null,
        ...proxyFields,
      },
      tx,
    );
    if (changed === 0) throw new PassError("ALREADY_DECIDED");

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

/**
 * 신청 없이 바로 부여. **시작은 언제나 지금이다** — 「지금 내보낸다」는 상황이라
 * 시작 시각을 받지 않는다(pass.window.issueWindow).
 */
export async function issuePass(
  actor: SessionUser,
  input: IssuePassInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  await assertCan(actor, "pass:issue");

  const { startAt, endAt } = issueWindow(input, now);

  const overlapping = await repo.findOverlapping(input.studentId, startAt, endAt);
  if (overlapping) throw new PassError("OVERLAPPING_PASS");

  // 외박이면 스키마가 guardianConfirmed를 이미 강제했다 — 여기서는 기록만 한다.
  const consentFields =
    input.type === "OVERNIGHT"
      ? {
          consentByProxy: true,
          consentedByUserId: actor.id,
          consentedByName: actor.name,
          consentedAt: now,
          consentNote: input.consentNote,
        }
      : {};

  return withTransaction(async (tx) => {
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
        decidedAt: now,
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
  });
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
    // 이미 취소·반려된 것에 사유만 새로 남기지 않는다 — 취소는 한 번만 일어난 일이다.
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

/**
 * 직접 부여의 학생 선택지. 그 학년도 재적 학생 전부다 —
 * 부여와 같은 권한(`pass:issue`)으로 막는다.
 */
export async function listStudentsForIssue(actor: SessionUser) {
  await assertCan(actor, "pass:issue");
  return repo.listEnrolledStudents(await repo.displayYear());
}

// ── 전체 내역 ──────────────────────────────────────────────────
//
// 「결재 대기」와 「지금 나가 있는 학생」은 지금 이 순간만 답한다 — 어제 나간
// 것을 되짚을 자리가 여기다. 읽기만 하므로 recordAudit을 남기지 않는다.

/**
 * 화면의 조회 조건을 repo가 읽는 필터로 옮긴다.
 *
 * **조회 창을 인자로 받는다.** 안에서 다시 구하면 시트 첫 줄에 적는 범위와
 * 실제 질의가 서로 다른 시계를 보게 되고, 자정을 걸친 요청에서 「30일」이 적힌
 * 파일에 29일치가 들어간다. 학년도가 여기 없는 것도 같은 이유는 아니다 —
 * 학번 대조에 쓸 학년도는 repo를 부를 때 함께 넘긴다.
 */
function historyFilter(
  query: PassHistoryExportInput,
  range: { since: Date; until: Date | null },
): PassHistoryFilter {
  return {
    type: query.type,
    status: query.status,
    q: query.q,
    // 4자리 숫자면 학번으로도 읽는다. 아니면 undefined가 되어 이름만 본다 —
    // 어느 쪽이든 한 번의 질의로 끝난다 (merit의 searchStudents와 같은 규칙).
    studentNumber: query.q ? (parseStudentNumber(query.q) ?? undefined) : undefined,
    since: range.since,
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

/**
 * 같은 조건의 전체를 한 파일로. 시트 조립과 파일명은 서비스가 만든다 —
 * 서버는 파일이 아니라 행렬만 돌려주고 클라이언트가 xlsx로 만든다
 * (`merit.export`와 같은 방식).
 */
export async function exportPassHistory(
  actor: SessionUser,
  input: PassHistoryExportInput,
): Promise<{ rows: (string | number)[][]; filename: string }> {
  await assertCan(actor, "pass:read:any");

  const year = await repo.displayYear();
  const range = passHistoryRange(input);
  const { entries } = await repo.listHistory(
    // 쪽을 나누지 않는다. 조회 창이 기본 30일로 이미 막혀 있어 한 파일이
    // 감당 못 할 만큼 커지지 않는다.
    { ...historyFilter(input, range), skip: 0, take: null },
    year,
  );

  return {
    rows: toPassHistorySheet(entries.map(toExportRow), input, range),
    filename: historyFilename(range),
  };
}

/** 파일 이름이 곧 기간이다 — 조건을 바꿔 두 번 받아도 서로 덮어쓰지 않는다. */
function historyFilename(range: { since: Date; until: Date | null }): string {
  const from = formatDateInput(range.since);
  return range.until
    ? `출입증내역_${from}~${formatDateInput(new Date(range.until.getTime() - 1))}.xlsx`
    : `출입증내역_${from}부터.xlsx`;
}

/** 조회 결과 한 줄 → 시트 한 줄. 학급·번호는 그 학년도 재적에서 나온다. */
function toExportRow(pass: PassWithStudent): PassHistoryExportRow {
  const enrollment = pass.studentProfile.enrollments[0];

  return {
    type: pass.type,
    status: pass.status,
    grade: enrollment?.schoolClass?.grade ?? null,
    classNo: enrollment?.schoolClass?.classNo ?? null,
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
