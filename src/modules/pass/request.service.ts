import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { assertCan, denyAccess } from "@/core/authz/errors";
import { DECIDABLE_STATUSES, requiresConsent } from "@/core/authz/pass-type";
import { withTransaction } from "@/core/db/client";
import { PassError } from "./pass.error";
import { toQrPath } from "./pass.qr";
import * as repo from "./pass.repo";
import { PASS_HISTORY_PAGE_SIZE } from "./pass.schema";
import type {
  ConsentPassInput,
  RequestPassInput,
  WithdrawPassInput,
} from "./pass.schema";
import { issueStudentCode } from "./pass.token";
import { buildScanUrl } from "./pass.url";
import { conflictWindow, requestWindow } from "./pass.window";

export async function requestPass(
  actor: SessionUser,
  input: RequestPassInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  await assertCan(actor, "pass:request");

  const profile = await repo.findStudentProfileByUserId(actor.id);
  if (!profile) throw new PassError("NO_STUDENT_PROFILE");

  const { startAt, endAt } = requestWindow(input, now);

  try {
    return await withTransaction(
      async (tx) => {
        const exists = await repo.lockStudentForPassCreation(profile.id, tx);
        if (!exists) throw new PassError("NO_STUDENT_PROFILE");

        const conflict = conflictWindow({ startAt, endAt });
        const overlapping = await repo.findOverlapping(
          profile.id,
          conflict.startAt,
          conflict.endAt,
          tx,
        );
        if (overlapping) throw new PassError("OVERLAPPING_PASS");

        const created = await repo.createPass(
          {
            studentProfileId: profile.id,
            type: input.type,
            status: "REQUESTED",
            startAt,
            endAt,
            destination: input.destination,
            reason: input.reason,
            requestedByUserId: actor.id,
            requestedByName: actor.name,
          },
          tx,
        );

        await recordAudit(
          {
            actorUserId: actor.id,
            actorName: actor.name,
            action: "pass:request",
            targetType: "Pass",
            targetId: created.id,
            metadata: {
              type: input.type,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
              destination: input.destination,
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

export async function withdrawPass(
  actor: SessionUser,
  input: WithdrawPassInput,
): Promise<void> {
  await assertCan(actor, "pass:request");

  const pass = await repo.findPass(input.passId);
  if (!pass) throw new PassError("PASS_NOT_FOUND");

  await assertOwnStudent(actor, pass.studentProfileId, "pass:request", input.passId);

  await withTransaction(async (tx) => {
    const changed = await repo.transition(
      input.passId,
      DECIDABLE_STATUSES,
      {
        status: "CANCELLED",
        cancelledByUserId: actor.id,
        cancelledByName: actor.name,
        cancelledAt: new Date(),
        cancelReason: input.reason ?? null,
      },
      tx,
    );
    if (changed === 0) throw new PassError("ALREADY_DECIDED");

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "pass:cancel",
        targetType: "Pass",
        targetId: input.passId,
        metadata: { type: pass.type, byOwner: true, reason: input.reason },
      },
      tx,
    );
  });
}

export async function consentPass(
  actor: SessionUser,
  input: ConsentPassInput,
  now: Date = new Date(),
): Promise<void> {
  await assertCan(actor, "pass:consent");

  const pass = await repo.findPass(input.passId);
  if (!pass) throw new PassError("PASS_NOT_FOUND");

  const linked = await repo.isParentOf(actor.id, pass.studentProfileId);
  if (!linked) {
    return denyAccess(actor, "pass:consent", {
      targetType: "Pass",
      targetId: input.passId,
    });
  }

  if (!requiresConsent(pass.type)) {
    throw new PassError("CONSENT_NOT_ALLOWED");
  }
  if (pass.endAt.getTime() <= now.getTime()) throw new PassError("PASS_EXPIRED");

  await withTransaction(async (tx) => {
    const outcome = await repo.transitionUnexpired(
      input.passId,
      ["REQUESTED"],
      {
        status: "CONSENTED",
        consentedByUserId: actor.id,
        consentedByName: actor.name,
        consentedAt: now,
        consentByProxy: false,
        consentNote: input.consentNote,
      },
      tx,
    );
    if (outcome === "EXPIRED") throw new PassError("PASS_EXPIRED");
    if (outcome !== "UPDATED") throw new PassError("ALREADY_DECIDED");

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "pass:consent",
        targetType: "Pass",
        targetId: input.passId,
        metadata: { type: pass.type, reason: input.consentNote },
      },
      tx,
    );
  });
}

function listWindow(page: number): { page: number; skip: number; take: number } {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return {
    page: safePage,
    skip: (safePage - 1) * PASS_HISTORY_PAGE_SIZE,
    take: PASS_HISTORY_PAGE_SIZE,
  };
}

function withPage(
  result: { entries: repo.PassWithStudent[]; total: number },
  page: number,
) {
  return {
    ...result,
    page,
    pageCount: Math.max(1, Math.ceil(result.total / PASS_HISTORY_PAGE_SIZE)),
  };
}

async function loadClampedPage(
  requestedPage: number,
  load: (window: { page: number; skip: number; take: number }) => Promise<{
    entries: repo.PassWithStudent[];
    total: number;
  }>,
) {
  const requestedWindow = listWindow(requestedPage);
  const initial = await load(requestedWindow);
  const pageCount = Math.max(1, Math.ceil(initial.total / PASS_HISTORY_PAGE_SIZE));
  const actualPage = Math.min(requestedWindow.page, pageCount);

  if (actualPage === requestedWindow.page || initial.total === 0) {
    return withPage(initial, actualPage);
  }

  return withPage(await load(listWindow(actualPage)), actualPage);
}

export async function getMyPasses(actor: SessionUser, page: number = 1) {
  await assertCan(actor, "pass:request");

  const profile = await repo.findStudentProfileByUserId(actor.id);
  if (!profile) throw new PassError("NO_STUDENT_PROFILE");

  const year = await repo.displayYear();
  return loadClampedPage(page, (window) =>
    repo.listForStudent(profile.id, year, window),
  );
}

export async function getMyLivePasses(actor: SessionUser, now: Date = new Date()) {
  await assertCan(actor, "pass:request");

  const profile = await repo.findStudentProfileByUserId(actor.id);
  if (!profile) throw new PassError("NO_STUDENT_PROFILE");

  return repo.listLiveForStudent(profile.id, now, await repo.displayYear(), 5);
}

export async function getMyChildPasses(
  actor: SessionUser,
  page: number = 1,
  now: Date = new Date(),
) {
  await assertCan(actor, "pass:consent");
  const year = await repo.displayYear();
  return loadClampedPage(page, (window) =>
    repo.listForParent(actor.id, year, now, window),
  );
}

export async function getMyChildPassesAwaitingConsent(
  actor: SessionUser,
  now: Date = new Date(),
  limit: number = 50,
) {
  await assertCan(actor, "pass:consent");
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 50) : 50;
  return repo.listAwaitingParentConsent(
    actor.id,
    now,
    await repo.displayYear(),
    safeLimit,
  );
}

export async function getPassDetail(actor: SessionUser, passId: string) {
  const pass = await repo.findPassForVerify(passId, await repo.displayYear());
  if (!pass) throw new PassError("PASS_NOT_FOUND");

  if (can(actor, "pass:read:any")) return pass;

  const profile = await repo.findStudentProfileByUserId(actor.id);
  const own = profile?.id === pass.studentProfileId;
  const guardian = !own && (await repo.isParentOf(actor.id, pass.studentProfileId));

  if (!own && !guardian) {
    return denyAccess(actor, "pass:read:any", {
      targetType: "Pass",
      targetId: passId,
    });
  }

  return pass;
}

export async function getMyStudentQr(
  actor: SessionUser,
  now: Date = new Date(),
): Promise<{ qr: { size: number; d: string }; validUntil: string }> {
  await assertCan(actor, "pass:request");

  // 교사의 전역 권한도 학생 본인 QR을 대신 발급할 수는 없다.
  if (actor.role !== "STUDENT") {
    return denyAccess(actor, "pass:request", {
      targetType: "User",
      targetId: actor.id,
    });
  }

  const profile = await repo.findStudentProfileByUserId(actor.id);
  if (!profile) {
    return denyAccess(actor, "pass:request", {
      targetType: "User",
      targetId: actor.id,
    });
  }

  const { code, validUntil } = issueStudentCode(profile.id, now);
  return {
    qr: toQrPath(buildScanUrl(code)),
    validUntil: validUntil.toISOString(),
  };
}

async function assertOwnStudent(
  actor: SessionUser,
  studentProfileId: string,
  action: string,
  passId: string,
): Promise<void> {
  const profile = await repo.findStudentProfileByUserId(actor.id);
  if (profile?.id === studentProfileId) return;

  return denyAccess(actor, action, { targetType: "Pass", targetId: passId });
}
