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

/**
 * 초대코드 가입. 로그인 이전 경로라 `can()` 없이, 초대코드와 이름·생년월일
 * 대조가 그 자리를 대신한다. 역할은 언제나 코드 레코드에서만 읽는다.
 */

export class RegistrationError extends Error {}

/** 무엇이 틀렸는지 알려주지 않는 공통 실패 문구. */
const GENERIC_FAILURE = "가입코드 또는 입력한 정보가 맞지 않습니다.";
/** 학생코드가 겹칠 때 성공 가입 트랜잭션째 재시도하는 횟수. */
const STUDENT_CODE_RETRIES = 5;

/**
 * 트랜잭션이 제한 시간을 다 썼는가 (Prisma P2028). 충돌이 아니라 대기가 길어서
 * 잘린 것이라 `isSerializationConflict`가 잡지 않는다 —
 * `pass/decision.service.ts`가 같은 자리에서 같은 판정을 한다.
 */
function isTransactionExpired(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2028"
  );
}

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
 *
 * **지금은 아무것도 보내지 않는다.** 초대코드를 확인한 뒤 곧바로 확인된 proof를
 * 만들고 끝낸다 — 실제 발송기(`requestCode`)는 운영 코드에 호출자가 없다.
 * 그래서 email·phone은 소유가 증명되지 않은 값이며, 그 대가와 다시 켤 때 함께
 * 볼 것들은 CLAUDE.md의 「지금 인증은 실제로 발송하지 않는다」에 적어 두었다.
 */
export async function requestVerification(
  code: string,
  channel: VerificationChannel,
  target: string,
): Promise<{ verified: true }> {
  await checkInvite(code);
  await createTemporaryVerifiedProof(channel, target);
  return { verified: true };
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
    await withTransaction(async (tx) => {
      const { revoked } = await repo.registerFailedAttempt(
        invite.id,
        MAX_INVITE_ATTEMPTS,
        tx,
      );
      if (revoked) {
        // 2차 요소를 여러 번 틀려 코드가 자동 폐기됐다 (I9). 로그인 이전이라
        // 행위자를 알 수 없어 actorUserId를 null로 남긴다.
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

  // 코드를 소진하기 전에 확인한다 — 제약에 부딪히면 코드가 낭비된다.
  if (await repo.emailExists(input.email)) {
    throw new RegistrationError("이미 쓰이고 있는 이메일입니다.");
  }

  // 클라이언트의 "인증했다" 주장은 믿지 않는다. 항상 DB로 확인한다.
  const emailVerification = await requireVerified("EMAIL", input.email);
  const phoneVerification = await requireVerified("PHONE", input.phone);

  // ── 계정 생성 ─────────────────────────────────────────────
  // 계정·코드·인증코드·감사로그가 한 트랜잭션이라 실패하면 통째로 롤백된다.
  const account = {
    userId: randomUUID(),
    accountId: randomUUID(),
    // 학생·교사 이름은 사전등록 값을 쓴다 — 공백 표기를 교사가 등록한 대로 맞춘다.
    name: role === "PARENT" ? input.name.trim() : expectedName,
    email: input.email,
    phone: input.phone,
    passwordHash: await hashPassword(input.password),
  };

  const verificationIds = [emailVerification.id, phoneVerification.id];
  const inviteId = invite.id;
  const parentStudentId = invite.studentId;

  async function completeWithTx(tx: DbClient) {
    if (role === "STUDENT") {
      const meta = student!;
      const year = await repo.findCurrentYearForUpdate(tx);
      if (year === null) throw new AcademicYearError("NO_CURRENT_YEAR");

      await repo.completeStudentRegistration(
        inviteId,
        account,
        {
          // KST 자정으로 고정한다 — 교사 수정과 기준이 달라지면 명단 대조가 갈린다.
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
            // 이 트랜잭션은 findCurrentYearForUpdate로 AcademicYear를 잠근다.
            // 명단 일괄 반영이 같은 잠금을 최대 120초 쥐는데(roster.service),
            // 학년 초 — 교사가 명단을 반영하는 바로 그때 — 가 새 학생들이
            // 가입하는 때다. 기본 5초로는 정상 대기가 가입 실패로 바뀐다.
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
    // 예산을 늘려도 더 긴 반영에서는 여전히 시간이 다한다. 그때 P2028을 그대로
    // 올려보내면 액션이 「가입하지 못했습니다.」만 띄워, 학생은 코드가 잘못된 줄
    // 알고 같은 버튼을 계속 누른다. 기다렸다 다시 하면 되는 실패라고 말한다.
    if (isTransactionExpired(error)) {
      throw new RegistrationError(
        "가입을 마치지 못했습니다. 잠시 뒤 다시 시도하세요.",
      );
    }
    throw error;
  }

  return { role };
}
