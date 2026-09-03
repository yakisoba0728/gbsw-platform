import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { recordAudit } from "@/core/audit/audit";
import { isRole, type Role } from "@/core/authz/roles";
import { type DbClient, withTransaction } from "@/core/db/client";
import { isSerializationConflict } from "@/core/db/transaction-conflict";
import { parseDateInputKst } from "@/lib/datetime";
import {
  isInviteUsable,
  MAX_INVITE_ATTEMPTS,
  normalizeInviteCode,
} from "@/modules/invites/invite-code";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
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

export class RegistrationError extends Error {}

const GENERIC_FAILURE = "가입코드 또는 입력한 정보가 맞지 않습니다.";
const STUDENT_CODE_RETRIES = 5;

function isTransactionExpired(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2028"
  );
}

/* 내부 전용. 반환값이 화면으로 나가지 않으므로 초대 id를 그대로 담는다. */
async function findUsableInvite(
  rawCode: string,
): Promise<{ id: string; role: Role }> {
  const invite = await repo.findInviteByCode(normalizeInviteCode(rawCode));

  if (!invite || !isInviteUsable(invite) || !isRole(invite.role)) {
    throw new RegistrationError(GENERIC_FAILURE);
  }

  return { id: invite.id, role: invite.role };
}

/* 화면이 받는 값이다. 사전등록 개인정보도, 내부 식별자도 넘기지 않는다. */
export async function checkInvite(rawCode: string): Promise<{ role: Role }> {
  const { role } = await findUsableInvite(rawCode);
  return { role };
}

/*
 * 발송은 초대가 허가하지만, 그 허가를 challenge에 새겨 둔다 — 초대별 발송 예산을
 * 세고, 가입 완료 때 두 proof가 같은 초대의 것인지 대조하기 위해서다.
 */
export async function requestVerification(
  code: string,
  channel: VerificationChannel,
  target: string,
): Promise<{ challengeId: string; mockCode?: string }> {
  const invite = await findUsableInvite(code);
  return requestCode(channel, target, invite.id);
}

/** 로그인 이전 경로로, 초대의 신원 대조가 권한 검사를 대신하고 역할은 초대에서만 읽는다. */
export async function completeRegistration(
  input: CompleteRegistrationInput,
): Promise<{ role: Role }> {
  const invite = await repo.findInviteByCode(normalizeInviteCode(input.code));

  if (!invite || !isInviteUsable(invite) || !isRole(invite.role)) {
    throw new RegistrationError(GENERIC_FAILURE);
  }

  const role = invite.role;

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
    await withTransaction(async (tx) => {
      const { revoked } = await repo.registerFailedAttempt(
        invite.id,
        MAX_INVITE_ATTEMPTS,
        tx,
      );
      if (revoked) {
        await recordAudit({
          actorUserId: null,
          actorName: "(가입 시도자)",
          action: "invite:auto-revoke",
          targetType: "Invite",
          targetId: invite.id,
        }, tx);
      }
    });
    throw new RegistrationError(GENERIC_FAILURE);
  }

  if (await repo.emailExists(input.email)) {
    throw new RegistrationError("이미 쓰이고 있는 이메일입니다.");
  }

  // proof는 지금 이 초대의 것이어야 하고, 확인한 대상이 곧 가입하는 값이어야 한다.
  const emailVerification = await requireVerified({
    challengeId: input.emailChallengeId,
    channel: "EMAIL",
    rawTarget: input.email,
    inviteId: invite.id,
  });
  const phoneVerification = await requireVerified({
    challengeId: input.phoneChallengeId,
    channel: "PHONE",
    rawTarget: input.phone,
    inviteId: invite.id,
  });

  const account = {
    userId: randomUUID(),
    accountId: randomUUID(),
    name: role === "PARENT" ? input.name.trim() : expectedName,
    email: input.email,
    phone: input.phone,
    passwordHash: await hashPassword(input.password),
  };

  const verificationIds = [emailVerification.id, phoneVerification.id];
  const inviteId = invite.id;
  const parentStudentId = invite.studentId;

  // 계정·초대·인증 proof·감사로그를 함께 소진하거나 함께 롤백한다.
  async function completeWithTx(tx: DbClient) {
    if (role === "STUDENT") {
      const meta = student!;
      const year = await repo.findCurrentYearForUpdate(tx);
      if (year === null) throw new AcademicYearError("NO_CURRENT_YEAR");

      await repo.completeStudentRegistration(
        inviteId,
        account,
        {
          birthDate: parseDateInputKst(meta.birthDate),
          grade: meta.grade,
          classNo: meta.classNo,
          number: meta.number,
        },
        year,
        tx,
      );
    } else if (role === "ADMIN") {
      await repo.completeAdminRegistration(inviteId, account, tx);
    } else {
      if (!parentStudentId) throw new RegistrationError(GENERIC_FAILURE);
      await repo.completeParentRegistration(
        inviteId,
        account,
        parentStudentId,
        tx,
      );
    }

    await consumeVerifications(verificationIds, tx);

    await recordAudit({
      actorUserId: account.userId,
      action: "registration:complete",
      targetType: "User",
      targetId: account.userId,
      metadata: { role, inviteId },
    }, tx);
  }

  try {
    if (role === "STUDENT") {
      for (let attempt = 1; attempt <= STUDENT_CODE_RETRIES; attempt += 1) {
        try {
          await withTransaction(completeWithTx, {
            isolationLevel: "Serializable",
            // 같은 학년도 잠금을 최대 120초 잡는 명단 반영을 기다릴 수 있어야 한다.
            timeout: 130_000,
            maxWait: 10_000,
          });
          break;
        } catch (error) {
          if (
            (repo.isStudentCodeCollision(error) || isSerializationConflict(error)) &&
            attempt < STUDENT_CODE_RETRIES
          ) {
            continue;
          }
          throw error;
        }
      }
    } else {
      await withTransaction(completeWithTx);
    }
  } catch (error) {
    if (error instanceof repo.InviteRaceError) {
      throw new RegistrationError("이미 쓰인 가입코드입니다.");
    }
    if (error instanceof repo.NumberTakenError) {
      throw new RegistrationError(
        "이 반·번호에 다른 학생이 있습니다. 선생님께 문의해 주세요.",
      );
    }
    if (isSerializationConflict(error)) {
      throw new RegistrationError(
        "가입을 마치지 못했습니다. 다시 시도하세요.",
      );
    }
    if (isTransactionExpired(error)) {
      throw new RegistrationError(
        "가입을 마치지 못했습니다. 잠시 뒤 다시 시도하세요.",
      );
    }
    throw error;
  }

  return { role };
}
