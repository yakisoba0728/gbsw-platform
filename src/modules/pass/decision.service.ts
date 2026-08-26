import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import {
  DECIDABLE_STATUSES,
  requiresConsent,
  type PassStatus,
  type PassType,
} from "@/core/authz/pass-type";
import { withTransaction } from "@/core/db/client";
import { PassError } from "./pass.error";
import * as repo from "./pass.repo";
import type {
  ApprovePassInput,
  CancelPassInput,
  IssuePassInput,
  RejectPassInput,
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
  if (requiresConsent(pass.type as PassType) && !consented && !byProxy) {
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
