import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { lockCredentialAccountForMutation } from "@/core/auth/credential-session-boundary";
import { isUniqueViolation, NumberTakenError } from "@/core/db/unique-violation";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

/** 현재 학년도 소속만 한 줄 붙인다. 화면은 늘 "지금 몇 반인지"를 묻는다. */
const currentEnrollment = (year: number) => ({
  where: { year },
  take: 1,
  select: {
    id: true,
    number: true,
    status: true,
    schoolClass: { select: { grade: true, classNo: true } },
  },
});

export async function listUsers(year: number) {
  return prisma.user.findMany({
    // 목록에서만 명단에서 빠진 계정을 뺀다. 상세는 그대로 볼 수 있다.
    where: { deletedAt: null },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      mustChangePassword: true,
      createdAt: true,
      studentProfile: {
        select: { id: true, enrollments: currentEnrollment(year) },
      },
    },
  });
}

export async function findById(userId: string, db: DbClient = prisma) {
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, deletedAt: true },
  });
}

/** 상세 화면이 쓰는 전체 정보. deletedAt으로 거르지 않는다 — 목록에서만 뺀다. */
export async function findDetail(userId: string, year: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      deletedAt: true,
      updatedAt: true,
      mustChangePassword: true,
      createdAt: true,
      studentProfile: {
        select: {
          id: true,
          birthDate: true,
          enrollments: currentEnrollment(year),
        },
      },
      parentLinks: {
        select: {
          student: {
            select: {
              user: { select: { name: true } },
              enrollments: currentEnrollment(year),
            },
          },
        },
      },
    },
  });
}

/**
 * 이 계정이 남겼거나 이 계정을 대상으로 한 기록.
 * OR의 두 갈래가 각각 인덱스를 타야 한다 — AuditLog에 actorUserId·targetId 인덱스가
 * 둘 다 있는 이유다. targetId 인덱스가 없으면 관련 줄이 take에 못 미치는 계정에서
 * 조기 종료가 안 일어나 감사로그 전 구간을 훑는다.
 */
export async function findRelatedAudit(userId: string, take: number) {
  return prisma.auditLog.findMany({
    where: { OR: [{ actorUserId: userId }, { targetId: userId }] },
    // 보조 정렬키가 없으면 자르는 자리가 흔들린다. createdAt의 기본값
    // CURRENT_TIMESTAMP는 Postgres에서 **트랜잭션 시작 시각**이라 명단 일괄 반영
    // 한 번이 남긴 수백 줄이 밀리초까지 같은 값을 갖는데, SQL은 정렬키가 같은 행
    // 사이의 순서를 보장하지 않는다 — take 경계에 동점이 걸리면 그중 어느 줄이
    // 보이는지가 호출마다 달라진다. 감사로그에서 "안 보인다"는 "없다"로 읽힌다.
    // id는 cuid라 시간순은 아니지만 유일하고 결정적이다 — 경계를 고정하는 데
    // 필요한 것은 시간순이 아니라 유일성이다.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    // 행위자 호칭(선생님·학부모님·님)을 붙이려면 역할이 필요하다. 계정이 지워졌으면
    // null이 오고 그때는 「님」으로 떨어진다 — 이름 스냅샷은 그대로 남는다.
    include: { actor: { select: { role: true } } },
  });
}

/** 이메일이 이미 다른 계정에 쓰이고 있을 때. */
export class EmailTakenError extends Error {}

/** 이 반·번호가 이미 다른 학생에게 배정돼 있을 때. 실물은 core/db에 하나뿐이다. */
export { NumberTakenError };

export class UserRevisionConflictError extends Error {}

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

export async function findCurrentYear(db: DbClient = prisma): Promise<number | null> {
  const current = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
  return current?.year ?? null;
}

export type UpdateUserAndEnrollmentInput = {
  /** 화면이 그려진 시점의 User.updatedAt. 달라졌으면 저장하지 않는다. */
  expectedUpdatedAt: Date;
  /** 이름·이메일·전화번호. 안 바뀌었으면 null — 문장 자체를 안 만든다. */
  profile: { name: string; email: string; phone: string } | null;
  /** 생년월일. 학적과 무관하게 학생이면 언제나 고칠 수 있다. */
  studentProfile: { studentProfileId: string; birthDate: Date } | null;
  /** 학년·반·번호 — 재학 중인 학생만 대상이다. 안 바뀌었으면 null. */
  enrollment: {
    studentProfileId: string;
    year: number;
    grade: number;
    classNo: number;
    number: number;
  } | null;
};

/**
 * 계정 정보와 학생 신원·소속을 한 트랜잭션으로 저장한다 — 반·번호 충돌로
 * 뒷부분이 실패해도 로그인 아이디인 이메일만 먼저 바뀌는 일이 없어야 한다.
 */
async function updateUserAndEnrollmentWithDb(
  db: DbClient,
  userId: string,
  input: UpdateUserAndEnrollmentInput,
): Promise<void> {
  try {
    const { count } = await db.user.updateMany({
      where: { id: userId, updatedAt: input.expectedUpdatedAt },
      data: {
        ...(input.profile ?? {}),
        updatedAt: new Date(),
      },
    });
    if (count === 0) throw new UserRevisionConflictError();
  } catch (error) {
    // 미리 조회해 검사하면 그 사이에 끼어드는 요청을 못 막는다. 유일 제약이
    // 진짜 방어선이라 위반을 잡아서 옮긴다.
    if (isUniqueViolation(error, "email")) throw new EmailTakenError();
    throw error;
  }

  if (input.studentProfile) {
    await db.studentProfile.update({
      where: { id: input.studentProfile.studentProfileId },
      data: { birthDate: input.studentProfile.birthDate },
    });
  }

  if (input.enrollment) {
    const { studentProfileId, year, grade, classNo, number } = input.enrollment;

    const schoolClass = await db.schoolClass.upsert({
      where: { year_grade_classNo: { year, grade, classNo } },
      create: { year, grade, classNo },
      update: {},
    });

    try {
      await db.enrollment.upsert({
        where: { studentProfileId_year: { studentProfileId, year } },
        create: {
          studentProfileId,
          year,
          classId: schoolClass.id,
          number,
          status: "ENROLLED",
        },
        // update에 status를 넣지 않는다 — 넣으면 졸업생의 신원만 고치는 경로가
        // 여기 닿았을 때 학적이 재학으로 되돌아간다.
        update: { classId: schoolClass.id, number },
      });
    } catch (error) {
      if (isUniqueViolation(error, "number")) throw new NumberTakenError();
      throw error;
    }
  }
}

export async function updateUserAndEnrollment(
  userId: string,
  input: UpdateUserAndEnrollmentInput,
  db?: DbClient,
): Promise<void> {
  if (db) {
    await updateUserAndEnrollmentWithDb(db, userId, input);
    return;
  }

  await withTransaction((tx) => updateUserAndEnrollmentWithDb(tx, userId, input));
}

/**
 * 계정을 활성/비활성으로 바꾼다. 비활성화는 세션 삭제까지 한 트랜잭션으로 묶는다 —
 * 중간에 실패하면 비활성인데 세션은 살아 있는 상태가 된다.
 */
async function setActiveWithDb(
  db: DbClient,
  userId: string,
  active: boolean,
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { status: active ? "ACTIVE" : "INACTIVE" },
  });

  if (!active) {
    await db.session.deleteMany({ where: { userId } });
  }
}

export async function setActive(
  userId: string,
  active: boolean,
  db?: DbClient,
): Promise<void> {
  if (db) {
    await setActiveWithDb(db, userId, active);
    return;
  }

  if (active) {
    await prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
    return;
  }

  await withTransaction((tx) => setActiveWithDb(tx, userId, active));
}

/**
 * 비밀번호 교체 + 다음 로그인 강제 변경 표시 + 세션 삭제를 한 트랜잭션으로 묶는다.
 * 비밀번호 로그인 수단이 없으면 아무것도 바꾸지 않고 0을 돌려준다.
 */
async function resetCredentialWithDb(
  db: DbClient,
  userId: string,
  passwordHash: string,
): Promise<number> {
  await lockCredentialAccountForMutation(userId, db);

  const { count } = await db.account.updateMany({
    where: { userId, providerId: "credential" },
    data: { password: passwordHash },
  });
  if (count === 0) return 0;

  await db.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
  await db.session.deleteMany({ where: { userId } });
  return count;
}

export async function resetCredential(
  userId: string,
  passwordHash: string,
  db?: DbClient,
): Promise<number> {
  if (db) return resetCredentialWithDb(db, userId, passwordHash);

  return withTransaction((tx) => resetCredentialWithDb(tx, userId, passwordHash));
}

/**
 * 완전 삭제 (오등록 정리 전용). 학적·상벌점도 Cascade로 함께 사라진다.
 * 명단 반영에서 빠진 학생도 영구 삭제된다. 이 함수는 상세 화면 단일 삭제용이다.
 */
async function deletePermanentlyWithDb(
  db: DbClient,
  userId: string,
  confirmName: string,
): Promise<boolean> {
  // createdById는 Restrict + non-null이라 먼저 지우지 않으면 user.delete가 막힌다.
  await db.invite.deleteMany({ where: { createdById: userId } });
  // usedById는 SetNull이라 안 지워도 되지만, metadata에 남는 이름·생년월일을 없앤다.
  await db.invite.deleteMany({ where: { usedById: userId } });
  // studentId로 달린 학부모 코드는 StudentProfile Cascade가 함께 지운다.
  const { count } = await db.user.deleteMany({ where: { id: userId, name: confirmName } });
  return count === 1;
}

export async function deletePermanently(
  userId: string,
  confirmName: string,
  db?: DbClient,
): Promise<boolean> {
  if (db) {
    return deletePermanentlyWithDb(db, userId, confirmName);
  }

  return withTransaction((tx) => deletePermanentlyWithDb(tx, userId, confirmName));
}
