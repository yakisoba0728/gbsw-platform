import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { assertCan, ForbiddenError } from "@/core/authz/errors";
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

/** 학생·학부모 쪽 경로. 소유권 검사가 전부 여기 있다. */

export async function requestPass(
  actor: SessionUser,
  input: RequestPassInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  await assertCan(actor, "pass:request");

  // 세션에서 유도한다. studentId를 인자로 받지 않는다.
  const profile = await repo.findStudentProfileByUserId(actor.id);
  if (!profile) throw new PassError("NO_STUDENT_PROFILE");

  const { startAt, endAt } = requestWindow(input, now);

  try {
    return await withTransaction(
      async (tx) => {
        const exists = await repo.lockStudentForPassCreation(profile.id, tx);
        if (!exists) throw new PassError("NO_STUDENT_PROFILE");

        // 유효 창이 아니라 conflictWindow로 묻는다 — 맞닿은 신청을 이어 붙여
        // 보호자 확인을 건너뛰는 길을 막는 것이 이 여백이다.
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
            // metadata는 JSON 열이다 — Date를 그대로 넣으면 직렬화 모양이 갈린다.
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
      // 명단 반영은 같은 User 행 잠금을 최대 120초 쥔다. 그 정상 대기를
      // 기본 ITX 제한(5초)이 업무 실패로 바꾸지 않도록 직접 부여와 맞춘다.
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
    // 조건부 갱신 하나. 읽고 나서 쓰면 그 사이의 승인을 덮어쓴다.
    const changed = await repo.transition(
      input.passId,
      // 학생 철회가 가능한 상태는 결재 가능한 상태와 같다 — 아직 결정 전인 것.
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

  // 교사가 대신 확인하는 길은 decision.service의 승인에 있다 — 이 경로는 보호자 전용이다.
  const linked = await repo.isParentOf(actor.id, pass.studentProfileId);
  if (!linked) {
    await recordDenied(actor, "pass:consent", input.passId);
    throw new ForbiddenError("pass:consent");
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

/** 학생 대시보드용. 내역 페이지를 자른 뒤 거르지 않고 DB에서 조건을 먼저 좁힌다. */
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

/** 학부모 화면과 대시보드가 공유하는, 지금 실제로 동의 가능한 신청 목록. */
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

/** 상세 화면. 본인·보호자·교사 셋이 각기 다른 근거로 통과한다. */
export async function getPassDetail(actor: SessionUser, passId: string) {
  const pass = await repo.findPassForVerify(passId, await repo.displayYear());
  if (!pass) throw new PassError("PASS_NOT_FOUND");

  if (can(actor, "pass:read:any")) return pass;

  const profile = await repo.findStudentProfileByUserId(actor.id);
  const own = profile?.id === pass.studentProfileId;
  const guardian = !own && (await repo.isParentOf(actor.id, pass.studentProfileId));

  if (!own && !guardian) {
    await recordDenied(actor, "pass:read:any", passId);
    throw new ForbiddenError("pass:read:any");
  }

  return pass;
}

/**
 * 학생증 한 장. **학생 본인만** 받는다.
 *
 * 교사·보호자는 못 받는다 — 이 코드는 정문에서 본인임을 말하는 물건이라,
 * 남이 대신 띄울 수 있으면 학생증이 아니게 된다. 보호자가 자녀의 출입증
 * **상세**를 읽을 수 있는 것과는 다른 이야기다(그쪽은 그대로다).
 *
 * 출입증이 하나도 없어도 준다. 학생증은 승인의 결과물이 아니라 신원이고,
 * 찍었을 때 「출입증 없음」이 뜨는 것이 이 설계에서 정상적인 답이다.
 */
export async function getMyStudentQr(
  actor: SessionUser,
  now: Date = new Date(),
): Promise<{ qr: { size: number; d: string }; validUntil: string }> {
  await assertCan(actor, "pass:request");

  // ADMIN의 전역 우회는 교사 업무용 권한이다. 학생 본인의 신원을
  // 나타내는 QR은 교사도 대신 받을 수 없다.
  if (actor.role !== "STUDENT") {
    await recordDenied(actor, "pass:request", actor.id, "User");
    throw new ForbiddenError("pass:request");
  }

  const profile = await repo.findStudentProfileByUserId(actor.id);
  if (!profile) {
    await recordDenied(actor, "pass:request", actor.id, "User");
    throw new ForbiddenError("pass:request");
  }

  const { code, validUntil } = issueStudentCode(profile.id, now);
  return {
    qr: toQrPath(buildScanUrl(code)),
    validUntil: validUntil.toISOString(),
  };
}

/** can()으로 못 가르는 거부. 거부 기록과 ForbiddenError를 같은 방식으로 맞춘다. */
async function assertOwnStudent(
  actor: SessionUser,
  studentProfileId: string,
  action: string,
  passId: string,
): Promise<void> {
  const profile = await repo.findStudentProfileByUserId(actor.id);
  if (profile?.id === studentProfileId) return;

  await recordDenied(actor, action, passId);
  throw new ForbiddenError(action);
}

async function recordDenied(
  actor: SessionUser,
  action: string,
  targetId: string,
  targetType: "Pass" | "User" = "Pass",
): Promise<void> {
  try {
    await recordAudit({
      actorUserId: actor.id,
      action: "authz:denied",
      targetType,
      targetId,
      metadata: { action },
    });
  } catch {
    // 감사 기록 실패가 거부 자체를 막지 않는다.
  }
}
