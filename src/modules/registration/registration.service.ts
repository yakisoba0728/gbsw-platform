import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { recordAudit } from "@/core/audit/audit";
import { isRole, type Role } from "@/core/authz/roles";
import { parseDateInputKst } from "@/lib/datetime";
import {
  isInviteUsable,
  MAX_INVITE_ATTEMPTS,
  normalizeInviteCode,
} from "@/lib/invite-code";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import {
  namedInviteMetaSchema,
  studentInviteMetaSchema,
} from "@/modules/invites/invite.schema";
import * as repo from "./registration.repo";
import type { CompleteRegistrationInput } from "./registration.schema";
import type { VerificationChannel } from "@/modules/verification/verification.schema";
import {
  consumeVerifications,
  requestCode,
  requireVerified,
} from "@/modules/verification/verification.service";
import { birthDateMatches, nameMatches } from "./registration.verify";

/**
 * 초대코드 가입. 로그인 이전 경로라 `can()` 없이, 초대코드와 이름·생년월일
 * 대조가 그 자리를 대신한다. 역할은 언제나 코드 레코드에서만 읽는다.
 */

export class RegistrationError extends Error {}

/** 무엇이 틀렸는지 알려주지 않는 공통 실패 문구. */
const GENERIC_FAILURE = "가입코드 또는 입력한 정보가 맞지 않습니다.";

/** 1단계 — 역할만 돌려준다. 사전등록 개인정보는 회신하지 않는다. */
export async function checkInvite(rawCode: string): Promise<{ role: Role }> {
  const invite = await repo.findInviteByCode(normalizeInviteCode(rawCode));

  if (!invite || !isInviteUsable(invite) || !isRole(invite.role)) {
    throw new RegistrationError(GENERIC_FAILURE);
  }

  return { role: invite.role };
}

/**
 * 인증코드 발송 — 유효한 초대코드를 함께 요구한다 (I4). 대상별 횟수 제한만으로는
 * 대상을 바꿔 가며 발송 비용을 태우는 것을 막지 못한다.
 */
export async function requestVerification(
  code: string,
  channel: VerificationChannel,
  target: string,
): Promise<{ mockCode?: string }> {
  await checkInvite(code);
  return requestCode(channel, target);
}

/** 2단계 — 2차 요소를 대조하고 계정을 만든다. */
export async function completeRegistration(
  input: CompleteRegistrationInput,
): Promise<{ role: Role }> {
  const invite = await repo.findInviteByCode(normalizeInviteCode(input.code));

  if (!invite || !isInviteUsable(invite) || !isRole(invite.role)) {
    throw new RegistrationError(GENERIC_FAILURE);
  }

  const role = invite.role;

  // ── 2차 요소 대조 ──────────────────────────────────────────
  const student =
    role === "STUDENT" ? studentInviteMetaSchema.parse(invite.metadata) : null;
  const named =
    role === "STUDENT" ? null : namedInviteMetaSchema.parse(invite.metadata);

  const expectedName = student?.name ?? named?.name ?? "";

  let verified = nameMatches(expectedName, input.name);
  if (verified && student) {
    verified = birthDateMatches(student.birthDate, input.birthDate ?? "");
  }

  if (!verified) {
    const { revoked } = await repo.registerFailedAttempt(invite.id, MAX_INVITE_ATTEMPTS);
    if (revoked) {
      // 2차 요소를 여러 번 틀려 코드가 자동 폐기됐다 (I9). 로그인 이전이라
      // 행위자를 알 수 없어 actorUserId를 null로 남긴다.
      await recordAudit({
        actorUserId: null,
        actorName: "(가입 시도자)",
        action: "invite:auto-revoke",
        targetType: "Invite",
        targetId: invite.id,
      });
    }
    throw new RegistrationError(GENERIC_FAILURE);
  }

  // 코드를 소진하기 전에 확인한다 — 제약에 부딪히면 코드가 낭비된다.
  if (await repo.emailExists(input.email)) {
    throw new RegistrationError("이미 쓰이고 있는 이메일입니다.");
  }

  // 클라이언트의 "인증했다" 주장은 믿지 않는다. 항상 DB로 확인한다.
  const emailVerification = await requireVerified("EMAIL", input.email);
  const phoneVerification = await requireVerified("PHONE", input.phone);

  // ── 계정 생성 ─────────────────────────────────────────────
  // 코드 소진과 계정 생성이 한 트랜잭션이라 중간에 실패하면 통째로 롤백된다.
  const account = {
    userId: randomUUID(),
    accountId: randomUUID(),
    // 학생·관리자 이름은 사전등록 값을 쓴다 — 공백 표기를 관리자가 등록한 대로 맞춘다.
    name: role === "PARENT" ? input.name.trim() : expectedName,
    email: input.email,
    phone: input.phone,
    passwordHash: await hashPassword(input.password),
  };

  try {
    if (role === "STUDENT") {
      const meta = student!;
      const year = await getCurrentYear();
      await repo.completeStudentRegistration(
        invite.id,
        account,
        {
          // KST 자정으로 고정한다 — 관리자 수정과 기준이 달라지면 명단 대조가 갈린다.
          birthDate: parseDateInputKst(meta.birthDate),
          grade: meta.grade,
          classNo: meta.classNo,
          number: meta.number,
        },
        year,
      );
    } else if (role === "ADMIN") {
      await repo.completeAdminRegistration(invite.id, account);
    } else {
      if (!invite.studentId) throw new RegistrationError(GENERIC_FAILURE);
      await repo.completeParentRegistration(
        invite.id,
        account,
        invite.studentId,
      );
    }
  } catch (error) {
    if (error instanceof repo.InviteRaceError) {
      throw new RegistrationError("이미 쓰인 가입코드입니다.");
    }
    if (error instanceof repo.NumberTakenError) {
      throw new RegistrationError(
        "이 반·번호에 다른 학생이 있습니다. 관리자에게 문의해 주세요.",
      );
    }
    throw error;
  }

  await consumeVerifications([emailVerification.id, phoneVerification.id]);

  await recordAudit({
    actorUserId: account.userId,
    action: "registration:complete",
    targetType: "User",
    targetId: account.userId,
    metadata: { role, inviteId: invite.id },
  });

  return { role };
}
