import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { isUniqueViolation, NumberTakenError } from "@/core/db/unique-violation";
import { generateStudentCode } from "@/lib/student-code";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

export class InviteRaceError extends Error {}

/** 학생코드가 겹칠 때 트랜잭션째 재시도하는 횟수. */
const STUDENT_CODE_RETRIES = 5;

/** 실물은 core/db에 하나뿐이다. 별개 클래스를 만들면 instanceof가 안 통한다. */
export { NumberTakenError };

export function isStudentCodeCollision(error: unknown): boolean {
  return isUniqueViolation(error, "studentCode");
}

export async function findInviteByCode(code: string, db: DbClient = prisma) {
  return db.invite.findUnique({ where: { code } });
}

export async function emailExists(
  email: string,
  db: DbClient = prisma,
): Promise<boolean> {
  return (await db.user.count({ where: { email } })) > 0;
}

export async function findCurrentYearForUpdate(db: DbClient): Promise<number | null> {
  await db.$queryRaw<Array<{ year: number }>>`
    SELECT "year"
    FROM "AcademicYear"
    ORDER BY "year"
    FOR UPDATE
  `;

  const current = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
  return current?.year ?? null;
}

/** 2차 요소 실패를 세고, 한계에 닿으면 코드를 폐기한다. */
export async function registerFailedAttempt(
  inviteId: string,
  maxAttempts: number,
  db: DbClient = prisma,
): Promise<{ revoked: boolean }> {
  const updated = await db.invite.update({
    where: { id: inviteId },
    data: { failedAttempts: { increment: 1 } },
    select: { failedAttempts: true },
  });

  if (updated.failedAttempts < maxAttempts) return { revoked: false };

  const { count } = await db.invite.updateMany({
    where: { id: inviteId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  return { revoked: count === 1 };
}

export type RegistrationAccount = {
  userId: string;
  accountId: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
};

async function createUserWithCredential(
  tx: DbClient,
  account: RegistrationAccount,
  role: string,
) {
  await tx.user.create({
    data: {
      id: account.userId,
      name: account.name,
      email: account.email,
      phone: account.phone,
      // 초대코드가 신뢰 기준이라 별도 메일 인증을 두지 않는다.
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

// 아래 셋은 코드 소진과 계정 생성을 한 트랜잭션에 넣는다 — 보상 로직이 필요 없다.

/**
 * 코드를 소진한다. 트랜잭션 안에서 **계정을 만든 뒤에** 부른다 (usedById가 외래키다).
 * PENDING 조건이 붙어 동시 요청 중 count 1을 받는 쪽은 하나뿐이다.
 */
async function consumeInvite(tx: DbClient, inviteId: string, userId: string) {
  const { count } = await tx.invite.updateMany({
    where: { id: inviteId, status: "PENDING" },
    data: { status: "USED", usedById: userId },
  });
  if (count !== 1) throw new InviteRaceError("ALREADY_USED");
}

async function completeStudentRegistrationWithDb(
  db: DbClient,
  inviteId: string,
  account: RegistrationAccount,
  student: { birthDate: Date; grade: number; classNo: number; number: number },
  year: number,
): Promise<void> {
  await createUserWithCredential(db, account, "STUDENT");

  // 학급은 없으면 만든다 — 교사가 미리 등록할 필요가 없게.
  const schoolClass = await db.schoolClass.upsert({
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

  const profile = await db.studentProfile.create({
    data: {
      userId: account.userId,
      birthDate: student.birthDate,
      // 한 번 부여하고 바뀌지 않는다.
      studentCode: generateStudentCode(),
    },
  });

  // 소속은 학년도별로 쌓인다. 가입은 현재 학년도 배정을 만든다.
  try {
    await db.enrollment.create({
      data: {
        studentProfileId: profile.id,
        year,
        classId: schoolClass.id,
        number: student.number,
        status: "ENROLLED",
      },
    });
  } catch (error) {
    // 그 사이 같은 반·번호가 다른 학생에게 쓰였을 수 있다. 미리 조회해도
    // 틈을 못 막으므로 유일 제약 위반을 잡아 옮긴다.
    if (isUniqueViolation(error, "number")) throw new NumberTakenError();
    throw error;
  }

  await consumeInvite(db, inviteId, account.userId);
}

export async function completeStudentRegistration(
  inviteId: string,
  account: RegistrationAccount,
  student: { birthDate: Date; grade: number; classNo: number; number: number },
  year: number,
  db?: DbClient,
): Promise<void> {
  if (db) {
    await completeStudentRegistrationWithDb(db, inviteId, account, student, year);
    return;
  }

  // 학생코드가 겹치면 Postgres가 트랜잭션을 중단시킨다 — 같은 트랜잭션 안에서
  // 새 코드로 이을 수 없어 트랜잭션째 다시 돈다.
  for (let attempt = 1; attempt <= STUDENT_CODE_RETRIES; attempt += 1) {
    try {
      await withTransaction((tx) =>
        completeStudentRegistrationWithDb(tx, inviteId, account, student, year),
      );
      return;
    } catch (error) {
      if (isStudentCodeCollision(error) && attempt < STUDENT_CODE_RETRIES) {
        continue;
      }
      throw error;
    }
  }
}

export async function completeAdminRegistration(
  inviteId: string,
  account: RegistrationAccount,
  db?: DbClient,
): Promise<void> {
  const run = async (tx: DbClient) => {
    await createUserWithCredential(tx, account, "ADMIN");
    await consumeInvite(tx, inviteId, account.userId);
  };

  if (db) {
    await run(db);
    return;
  }

  await withTransaction(run);
}

export async function completeParentRegistration(
  inviteId: string,
  account: RegistrationAccount,
  studentId: string,
  db?: DbClient,
): Promise<void> {
  const run = async (tx: DbClient) => {
    await createUserWithCredential(tx, account, "PARENT");
    await tx.parentStudent.create({
      data: { parentUserId: account.userId, studentId },
    });
    await consumeInvite(tx, inviteId, account.userId);
  };

  if (db) {
    await run(db);
    return;
  }

  await withTransaction(run);
}
