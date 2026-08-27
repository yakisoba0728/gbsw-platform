import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { assertCan, ForbiddenError } from "@/core/authz/errors";
import { DECIDABLE_STATUSES, requiresConsent } from "@/core/authz/pass-type";
import { withTransaction } from "@/core/db/client";
import { PassError } from "./pass.error";
import { toQrPath } from "./pass.qr";
import * as repo from "./pass.repo";
import type {
  ConsentPassInput,
  RequestPassInput,
  WithdrawPassInput,
} from "./pass.schema";
import { issueStudentCode } from "./pass.token";
import { buildScanUrl } from "./pass.url";
import { requestWindow } from "./pass.window";

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

  const overlapping = await repo.findOverlapping(profile.id, startAt, endAt);
  if (overlapping) throw new PassError("OVERLAPPING_PASS");

  return withTransaction(async (tx) => {
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
  });
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

  await withTransaction(async (tx) => {
    const changed = await repo.transition(
      input.passId,
      ["REQUESTED"],
      {
        status: "CONSENTED",
        consentedByUserId: actor.id,
        consentedByName: actor.name,
        consentedAt: new Date(),
        consentByProxy: false,
        consentNote: input.consentNote,
      },
      tx,
    );
    if (changed === 0) throw new PassError("ALREADY_DECIDED");

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

export async function getMyPasses(actor: SessionUser) {
  await assertCan(actor, "pass:request");

  const profile = await repo.findStudentProfileByUserId(actor.id);
  if (!profile) throw new PassError("NO_STUDENT_PROFILE");

  return repo.listForStudent(profile.id, await repo.displayYear());
}

export async function getMyChildPasses(actor: SessionUser) {
  await assertCan(actor, "pass:consent");
  return repo.listForParent(actor.id, await repo.displayYear());
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
  const profile = await repo.findStudentProfileByUserId(actor.id);
  if (!profile) {
    await recordDenied(actor, "pass:request", actor.id);
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
  passId: string,
): Promise<void> {
  try {
    await recordAudit({
      actorUserId: actor.id,
      action: "authz:denied",
      targetType: "Pass",
      targetId: passId,
      metadata: { action },
    });
  } catch {
    // 감사 기록 실패가 거부 자체를 막지 않는다.
  }
}
