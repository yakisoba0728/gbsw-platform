import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { isUniqueViolation, NumberTakenError } from "@/core/db/unique-violation";
import type { EnrollmentChange } from "./enrollment.schema";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

/** 기존 import 경로를 깨지 않기 위해 re-export한다. 실물은 core/db에 하나뿐이다. */
export { NumberTakenError };

/** 트랜잭션 밖에서 쓰는 가벼운 조회. 쓰기 경로는 아래 ForUpdate 쪽을 쓴다. */
export async function findCurrentYear(db: DbClient = prisma): Promise<number | null> {
  const current = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
  return current?.year ?? null;
}

/**
 * 현재 학년도를 **잠그고** 읽는다. 쓰기 트랜잭션은 예외 없이 이쪽을 쓴다
 * (merit·roster·admin-user·registration이 모두 같은 함수를 갖는다).
 *
 * Serializable로 감싸는 것만으로는 부족하다 — Postgres의 직렬화 검사는 양쪽이
 * 다 SERIALIZABLE일 때만 도는데, 학년도를 바꾸는 `setCurrentYear`는 기본
 * 격리수준으로 돈다. 잠금 없이 읽으면 두 트랜잭션이 서로를 못 보고 둘 다
 * 성공해, 저장은 방금 지나간 학년도에 조용히 커밋된다.
 *
 * 전 행을 `year` 순서로 잠근다. isCurrent 행만 잡으면 "현재를 옮기는" 쪽과
 * 잠그는 행이 어긋나 지나칠 수 있고, 순서를 고정해야 교착이 안 생긴다.
 */
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

/**
 * 그 학년도의 학생 전원. 배정이 없는 학생도 포함한다 — 학년도가 막 넘어가면
 * 전원이 그 상태다. 교사로 승격된 계정은 프로필이 남아 있어도 뺀다.
 */
export async function listByYear(year: number, db: DbClient = prisma) {
  const profiles = await db.studentProfile.findMany({
    // **학적으로 거르지 않는다** — 이 표가 학적을 *고치는* 자리라 졸업·퇴학 학생도
    // 서야 한다. 상벌점 쪽이 「명단에서 빠진 학생」을 재적으로 판정하는 것과 다른
    // 질문이다. 남은 `deletedAt` 조건은 legacy 삭제 표시를 거르는 것이고(운영에서
    // 채워지는 일이 없다), 열과 함께 남긴다 — prisma/schema.prisma의 주석을 볼 것.
    where: { user: { role: "STUDENT", deletedAt: null } },
    select: {
      id: true,
      birthDate: true,
      user: { select: { id: true, name: true, email: true, status: true } },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          updatedAt: true,
          grade: true,
          classNo: true,
          number: true,
          status: true,
        },
      },
    },
  });

  return profiles.map((p) => {
    const e = p.enrollments[0];
    return {
      studentProfileId: p.id,
      userId: p.user.id,
      name: p.user.name,
      email: p.user.email,
      birthDate: p.birthDate,
      accountActive: p.user.status === "ACTIVE",
      enrollmentUpdatedAt: e?.updatedAt ?? null,
      grade: e?.grade ?? null,
      classNo: e?.classNo ?? null,
      number: e?.number ?? null,
      // 배정이 없으면 아직 아무 학적도 아니다. 화면에서 재학으로 채우게 둔다.
      status: e?.status ?? null,
    };
  });
}

/**
 * 학생 한 사람. 학급·번호·학적은 그 학년도 재적 기준이고, 명단에서 빠진 학생도
 * 돌려준다 — `removed`가 그 사실을 싣고 `status`가 학적(졸업·퇴학·전출…)을 말한다.
 *
 * 학생 상세 화면(`/students/<id>`)의 머리글과 「학생 정보」 탭이 함께 쓴다.
 * 무엇을 내보낼지는 서비스가 권한에 따라 가른다.
 */
export async function findStudentDetail(
  studentProfileId: string,
  year: number,
  db: DbClient = prisma,
) {
  const profile = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: {
      id: true,
      studentCode: true,
      birthDate: true,
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          grade: true,
          classNo: true,
          number: true,
          status: true,
        },
      },
    },
  });
  if (!profile) return null;

  const enrollment = profile.enrollments[0];
  return {
    studentProfileId: profile.id,
    userId: profile.user.id,
    studentCode: profile.studentCode,
    name: profile.user.name,
    email: profile.user.email,
    role: profile.user.role,
    birthDate: profile.birthDate,
    grade: enrollment?.grade ?? null,
    classNo: enrollment?.classNo ?? null,
    number: enrollment?.number ?? null,
    status: enrollment?.status ?? null,
    /**
     * 그 학년도 명단에서 빠졌는가 — 재적(ENROLLED)이 아니면 true다.
     * `merit.repo.findStudentHeader`와 같은 판정이며, 날짜가 아니라 참·거짓인
     * 이유도 같다: 학적에는 "언제 바뀌었나"가 없다. 날짜를 싣던 옛 값
     * (`user.deletedAt`)은 아무도 채우지 않아 화면이 늘 꺼져 있었다.
     */
    removed: enrollment?.status !== "ENROLLED",
  };
}

/** applyAll에 넘기는 한 학생분의 반영 내용. 검증·정리는 서비스가 이미 끝낸 상태다. */
export type PlannedEnrollment = Omit<EnrollmentChange, "expectedUpdatedAt"> & {
  userId: string;
  /** 계정이 최종적으로 활성이어야 하는지. statusChanged가 false면 안 쓴다. */
  accountActive: boolean;
  /** 학적(status)이 실제로 바뀌는 항목인지. false면 user.status를 건드리지 않는다. */
  statusChanged: boolean;
};

/**
 * 고친 학생 전원의 소속·학적과 계정 상태를 단일 트랜잭션으로 반영한다 — 중간에
 * 터져도 앞선 학생만 커밋되면 안 된다. 계정은 statusChanged인 항목만 건드린다.
 */
export async function applyAll(
  year: number,
  items: PlannedEnrollment[],
  db?: DbClient,
): Promise<void> {
  const run = async (tx: DbClient) => {
    for (const item of items) {
      await tx.enrollment.upsert({
        where: {
          studentProfileId_year: {
            studentProfileId: item.studentProfileId,
            year,
          },
        },
        create: {
          studentProfileId: item.studentProfileId,
          year,
          grade: item.grade,
          classNo: item.classNo,
          number: item.number,
          status: item.status,
        },
        update: {
          grade: item.grade,
          classNo: item.classNo,
          number: item.number,
          status: item.status,
        },
      });

      if (item.statusChanged) {
        await tx.user.update({
          where: { id: item.userId },
          data: { status: item.accountActive ? "ACTIVE" : "INACTIVE" },
        });

        // 비활성으로 넘어가면 남아 있는 세션도 끊는다.
        if (!item.accountActive) {
          await tx.session.deleteMany({ where: { userId: item.userId } });
        }
      } else {
        // User.updatedAt은 사용자 상세 편집의 aggregate revision이다. 재적만 바뀌어도
        // 이를 올려 오래된 상세 폼이 최신 명단 변경을 되돌리지 못하게 한다.
        await tx.user.update({
          where: { id: item.userId },
          data: { updatedAt: new Date() },
        });
      }
    }
  };

  try {
    if (db) {
      await run(db);
      return;
    }

    await withTransaction(
      run,
      // 500행 상한 × 학생당 최대 4개 문장 — 기본 5초 타임아웃으로는 부족할 수 있다.
      { timeout: 30_000, maxWait: 5_000 },
    );
  } catch (error) {
    // 사전 검사를 빠져나간 경합에 대한 마지막 방어선.
    if (isUniqueViolation(error, "number")) throw new NumberTakenError();
    throw error;
  }
}
