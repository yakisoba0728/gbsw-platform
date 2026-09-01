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

/** 교사 쪽 경로. 교직원 사이에 권한 차등이 없어 소유권 검사가 없다. */

/** 취소가 가능한 상태. 승인된 것을 무르는 일이 여기 있다. */
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
  // 전화 대행은 보호자 확인이 실제로 비어 있는 외박에서만 성립한다. 외출이나 이미
  // 보호자가 확인한 신청에 임의로 byProxy를 보내도 기존 확인 기록을 덮지 않는다.
  const requestedProxy = needsConsent && input.byProxy === "on";

  // 외박의 APPROVED 전이는 보호자 확인이 있을 때만. 대행이 그 자리를 대신한다.
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
    // **대행 폼이 보낸 글을 버리지 않는다.** 결재 화면은 그려질 때의 상태로 칸
    // 이름을 정하므로, 교사가 「확인 방법」에 적는 사이 보호자가 먼저 확인하면
    // 대행이 성립하지 않는 채로 consentNote만 들고 여기 온다. 그때 승인 메모로
    // 옮겨 담지 않으면 교사가 적은 문장이 Pass에도 감사로그에도 남지 않는다.
    let decisionNote = input.decisionNote ?? input.consentNote ?? null;
    let consentNote: string | null = null;
    let outcome: repo.UnexpiredTransitionOutcome;

    if (requestedProxy) {
      decisionNote = null;
      consentNote = input.consentNote ?? null;
      outcome = await repo.transitionUnexpired(
        input.passId,
        ["REQUESTED"],
        now,
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
        // 화면을 연 뒤 보호자가 먼저 확인했으면 첫 전이는 CONSENTED를 만난다.
        // 이때는 보호자 기록을 덮지 않고 승인만 이어 간다. 대행 입력 메모도
        // 보호자 확인 메모로 저장하지 않는다.
        consentNote = null;
        outcome = await repo.transitionUnexpired(
          input.passId,
          ["CONSENTED"],
          now,
          { ...decisionFields, decisionNote },
          tx,
        );
      }
    } else {
      outcome = await repo.transitionUnexpired(
        input.passId,
        DECIDABLE_STATUSES,
        now,
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

  // 종료 시각은 제출 당시 달력 날짜에 고정한다. 잠금 대기가 자정을 넘었다고
  // 외출 종료일을 다음 날로 밀면 사용자가 내지 않은 하루짜리 출입증이 된다.
  const { endAt } = issueWindow(input, now);

  try {
    return await withTransaction(
      async (tx) => {
        const year = await repo.findCurrentYearForUpdate(tx);
        const eligible =
          year !== null &&
          (await repo.lockEligibleStudentForPassCreation(input.studentId, year, tx));
        if (!eligible) throw new PassError("STUDENT_NOT_ELIGIBLE");

        // AcademicYear/User/Profile/Enrollment 잠금을 기다리는 동안 호출자의 `now`는
        // 최대 2분 넘게 낡을 수 있다. 잠금을 모두 얻은 뒤 DB 시각으로 시작을 다시
        // 잡고, 이미 끝난 창은 APPROVED 행을 만들기 전에 거부한다.
        const issuedAt = await repo.currentDatabaseTime(tx);
        if (endAt.getTime() <= issuedAt.getTime()) {
          throw new PassError("PASS_EXPIRED");
        }
        const startAt = issuedAt;

        // 외박이면 스키마가 guardianConfirmed를 이미 강제했다 — 여기서는 기록만 한다.
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

        // 신청 경로와 같은 여백으로 묻는다 — 겹침의 뜻이 두 경로에서 갈리면
        // 학생이 못 내는 조합을 교사가 대신 만들어 줄 수 있다.
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
      // 명단 반영은 같은 AcademicYear 잠금을 최대 120초 쥔다. 그 정상 대기를
      // 기본 ITX 제한(5초)이 업무 실패로 바꾸지 않도록 여유를 둔다.
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
  query: PassHistoryExportInput & { studentProfileId?: string },
  range: { since: Date; until: Date | null },
): PassHistoryFilter {
  return {
    type: query.type,
    status: query.status,
    q: query.q,
    // 4자리 숫자면 학번으로도 읽는다. 아니면 undefined가 되어 이름만 본다 —
    // 어느 쪽이든 한 번의 질의로 끝난다 (merit의 searchStudents와 같은 규칙).
    studentNumber: query.q ? (parseStudentNumber(query.q) ?? undefined) : undefined,
    studentProfileId: query.studentProfileId,
    // **한 학생으로 좁혔고 시작일을 안 골랐으면 하한을 걷는다.** 기본 30일 창은
    // 전교를 훑지 않으려는 장치이지 한 사람의 누적을 자르라는 규칙이 아니다 —
    // 그대로 두면 학생 상세의 출입증 탭이 9월에 나간 기록을 12월에 못 보여준다.
    // 사람이 고른 시작일은 좁힌 조회에서도 그대로 지킨다.
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

/**
 * 한 학생의 상태별 건수. 학생 상세의 출입증 탭이 목록 위에 세우는 줄이다 —
 * 목록은 상태 필터와 쪽에 따라 바뀌지만 이 숫자는 언제나 누적 전체를 답한다.
 */
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
    // 모르는 상태는 합계에만 든다 — 없는 칸을 만들지 않는다.
    if (isPassStatus(row.status)) byStatus[row.status] = row.count;
  }

  return { byStatus, total };
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
