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
} from "@/lib/invite-code";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import {
  namedInviteMetaSchema,
  studentInviteMetaSchema,
} from "@/modules/invites/invite.schema";
import * as repo from "./registration.repo";
import type { CompleteRegistrationInput } from "./registration.schema";
import type { VerificationChannel } from "@/modules/verification/verification.schema";
import {
  createTemporaryVerifiedProof,
  consumeVerifications,
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

export async function checkInvite(rawCode: string): Promise<{ role: Role }> {
  const invite = await repo.findInviteByCode(normalizeInviteCode(rawCode));

  if (!invite || !isInviteUsable(invite) || !isRole(invite.role)) {
    throw new RegistrationError(GENERIC_FAILURE);
  }

  return { role: invite.role };
}

/** 현재는 발송 없이 proof를 만든다. 이메일·전화 소유는 증명하지 않으며 정책은 CLAUDE.md 참고. */
export async function requestVerification(
  code: string,
  channel: VerificationChannel,
  target: string,
): Promise<{ verified: true }> {
  await checkInvite(code);
  await createTemporaryVerifiedProof(channel, target);
  return { verified: true };
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

  const emailVerification = await requireVerified("EMAIL", input.email);
  const phoneVerification = await requireVerified("PHONE", input.phone);

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
