import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { recordAudit } from "@/core/audit/audit";
import { isRole, type Role } from "@/core/authz/roles";
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
import {
  consumeVerifications,
  requireVerified,
} from "@/modules/verification/verification.service";
import { birthDateMatches, nameMatches } from "./registration.verify";

/**
 * 초대코드 가입.
 *
 * ⚠️ 부트스트랩과 마찬가지로 로그인 이전 경로라 `can()`을 쓰지 않는다.
 * 그 자리를 **초대코드(1차 비밀) + 이름·생년월일 대조(2차 요소)**가 대신한다.
 * 역할은 언제나 코드 레코드에서만 읽는다 — 클라이언트는 역할을 주장할 수 없다.
 */

export class RegistrationError extends Error {}

/** 무엇이 틀렸는지 알려주지 않는 공통 실패 메시지. */
const GENERIC_FAILURE = "가입코드 또는 입력한 정보가 올바르지 않습니다.";

/**
 * 1단계 — 코드가 쓸 수 있는지 확인하고 역할만 돌려준다.
 * 이름·생년월일 등 사전등록 개인정보는 절대 회신하지 않는다.
 */
export async function checkInvite(rawCode: string): Promise<{ role: Role }> {
  const invite = await repo.findInviteByCode(normalizeInviteCode(rawCode));

  if (!invite || !isInviteUsable(invite) || !isRole(invite.role)) {
    throw new RegistrationError(GENERIC_FAILURE);
  }

  return { role: invite.role };
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
    await repo.registerFailedAttempt(invite.id, MAX_INVITE_ATTEMPTS);
    throw new RegistrationError(GENERIC_FAILURE);
  }

  // 코드를 소진하기 전에 확인한다. DB 유니크 제약에 부딪히면 코드가 낭비된다.
  if (await repo.emailExists(input.email)) {
    throw new RegistrationError("이미 사용 중인 이메일입니다.");
  }

  // 클라이언트가 "인증했다"고 주장하는 건 믿지 않는다. 항상 DB로 확인한다.
  const emailVerification = await requireVerified("EMAIL", input.email);
  const phoneVerification = await requireVerified("PHONE", input.phone);

  // ── 계정 생성 ─────────────────────────────────────────────
  // 코드 소진과 계정·프로필 생성이 한 트랜잭션이라 중간 실패 시 통째로 롤백된다.
  const account = {
    userId: randomUUID(),
    accountId: randomUUID(),
    // 학생·관리자 이름은 사전등록 값을 쓴다 (대조를 통과했으므로 같은 값이지만,
    // 공백 표기 차이를 관리자가 등록한 형태로 통일한다).
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
          birthDate: new Date(`${meta.birthDate}T00:00:00Z`),
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
      throw new RegistrationError("이미 사용된 가입코드입니다.");
    }
    if (error instanceof repo.NumberTakenError) {
      throw new RegistrationError(
        "이 반·번호에 이미 다른 학생이 있습니다. 관리자에게 문의하세요.",
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
