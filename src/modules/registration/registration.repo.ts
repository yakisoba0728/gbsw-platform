import { prisma } from "@/core/db/client";
import { isUniqueViolation } from "@/core/db/unique-violation";
import type { Prisma } from "@/generated/prisma/client";
import { generateStudentCode } from "@/lib/student-code";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

type Tx = Prisma.TransactionClient;

export class InviteRaceError extends Error {}

/**
 * 학생코드 유일 제약 충돌 시 트랜잭션째 재시도하는 횟수.
 * invite.service.ts의 CODE_RETRIES와 같은 규약이다. 31^7 공간이라 실제로는 거의
 * 일어나지 않는다.
 */
const STUDENT_CODE_RETRIES = 5;

/** 이 반·번호가 이미 다른 학생에게 배정돼 있을 때. (Enrollment_classId_number_key) */
export class NumberTakenError extends Error {}

export async function findInviteByCode(code: string) {
  return prisma.invite.findUnique({ where: { code } });
}

export async function emailExists(email: string): Promise<boolean> {
  return (await prisma.user.count({ where: { email } })) > 0;
}

/** 2차 요소 실패를 세고, 한계에 닿으면 코드를 폐기한다. */
export async function registerFailedAttempt(
  inviteId: string,
  maxAttempts: number,
): Promise<{ revoked: boolean }> {
  const updated = await prisma.invite.update({
    where: { id: inviteId },
    data: { failedAttempts: { increment: 1 } },
    select: { failedAttempts: true },
  });

  if (updated.failedAttempts < maxAttempts) return { revoked: false };

  await prisma.invite.updateMany({
    where: { id: inviteId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  return { revoked: true };
}

export type RegistrationAccount = {
  userId: string;
  accountId: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
};

/**
 * 코드를 소진한다. 트랜잭션 안에서, **계정을 만든 뒤에** 호출해야 한다.
 * (`usedById`가 user를 참조하는 외래키라 순서를 뒤집으면 제약에 걸린다.)
 *
 * `status: "PENDING"` 조건이 붙은 updateMany라 동시 요청 중 count 1을 받는 쪽은
 * 반드시 하나뿐이다. 두 번째 요청은 첫 번째가 커밋될 때까지 행 잠금에 걸렸다가
 * 조건을 다시 평가해 count 0을 받고, 트랜잭션 전체가 롤백되므로
 * 앞서 만든 계정도 함께 사라진다.
 */
async function consumeInvite(tx: Tx, inviteId: string, userId: string) {
  const { count } = await tx.invite.updateMany({
    where: { id: inviteId, status: "PENDING" },
    data: { status: "USED", usedAt: new Date(), usedById: userId },
  });
  if (count !== 1) throw new InviteRaceError("ALREADY_USED");
}

async function createUserWithCredential(
  tx: Tx,
  account: RegistrationAccount,
  role: string,
) {
  await tx.user.create({
    data: {
      id: account.userId,
      name: account.name,
      email: account.email,
      phone: account.phone,
      // 초대코드가 신뢰 기준이므로 별도 메일 인증을 두지 않는다.
      emailVerified: true,
      role,
      status: "ACTIVE",
      mustChangePassword: false,
    },
  });

  await tx.account.create({
    data: {
      id: account.accountId,
      // credential 로그인에서는 accountId가 곧 userId다.
      accountId: account.userId,
      providerId: "credential",
      userId: account.userId,
      password: account.passwordHash,
    },
  });
}

/*
 * 아래 세 함수는 코드 소진과 계정·프로필 생성을 **한 트랜잭션**에 넣는다.
 * 중간에 어디가 실패하든 통째로 롤백되므로 별도의 보상 로직이 필요 없다.
 */

export async function completeStudentRegistration(
  inviteId: string,
  account: RegistrationAccount,
  student: { birthDate: Date; grade: number; classNo: number; number: number },
  year: number,
): Promise<void> {
  // 학생코드가 겹치면(31^7 공간, 사실상 희박) Postgres가 그 문장부터 트랜잭션을
  // 중단시킨다 — 같은 트랜잭션 안에서 새 코드로 이어서 재시도할 수 없으므로
  // 트랜잭션째 다시 돈다. NumberTakenError·InviteRaceError는 학생코드와 무관한
  // 유일 제약이라 아래 catch에서 바로 다시 던져지고 재시도를 낭비하지 않는다.
  for (let attempt = 1; attempt <= STUDENT_CODE_RETRIES; attempt += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        await createUserWithCredential(tx, account, "STUDENT");

        // 학급은 없으면 만든다 — 관리자가 미리 등록해 둘 필요가 없게.
        const schoolClass = await tx.schoolClass.upsert({
          where: {
            year_grade_classNo: {
              year,
              grade: student.grade,
              classNo: student.classNo,
            },
          },
          create: { year, grade: student.grade, classNo: student.classNo },
          update: {},
        });

        const profile = await tx.studentProfile.create({
          data: {
            userId: account.userId,
            birthDate: student.birthDate,
            // 계정을 만들 때 한 번 부여하고 바뀌지 않는다.
            studentCode: generateStudentCode(),
          },
        });

        // 소속은 학년도별로 쌓인다. 가입은 현재 학년도 배정을 만든다.
        try {
          await tx.enrollment.create({
            data: {
              studentProfileId: profile.id,
              year,
              classId: schoolClass.id,
              number: student.number,
              status: "ENROLLED",
            },
          });
        } catch (error) {
          // 관리자가 발급한 초대코드의 반·번호가 그 사이 다른 학생에게도 쓰였을 수 있다.
          // 미리 조회해 봐야 그 틈을 못 막으므로 유일 제약 위반을 잡아서 옮긴다.
          if (isUniqueViolation(error, "number")) throw new NumberTakenError();
          throw error;
        }

        await consumeInvite(tx, inviteId, account.userId);
      });
      return;
    } catch (error) {
      if (isUniqueViolation(error, "studentCode") && attempt < STUDENT_CODE_RETRIES) {
        continue;
      }
      throw error;
    }
  }
}

export async function completeAdminRegistration(
  inviteId: string,
  account: RegistrationAccount,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await createUserWithCredential(tx, account, "ADMIN");
    await consumeInvite(tx, inviteId, account.userId);
  });
}

export async function completeParentRegistration(
  inviteId: string,
  account: RegistrationAccount,
  studentId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await createUserWithCredential(tx, account, "PARENT");
    await tx.parentStudent.create({
      data: { parentUserId: account.userId, studentId },
    });
    await consumeInvite(tx, inviteId, account.userId);
  });
}
