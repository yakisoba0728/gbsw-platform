import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { isUniqueViolation } from "@/core/db/unique-violation";

export async function findCurrent(db: DbClient = prisma) {
  return db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
}

export async function findCurrentYear(db: DbClient = prisma): Promise<number | null> {
  return (await findCurrent(db))?.year ?? null;
}

/** 전환과 저장 모두 모든 학년도 행을 같은 순서로 잠근 뒤 현재 값을 읽는다. */
export async function findCurrentYearForUpdate(db: DbClient): Promise<number | null> {
  await db.$queryRaw<Array<{ year: number }>>`
    SELECT "year"
    FROM "AcademicYear"
    ORDER BY "year"
    FOR UPDATE
  `;
  return findCurrentYear(db);
}

export async function listYears() {
  return prisma.academicYear.findMany({
    orderBy: { year: "desc" },
    select: { year: true, isCurrent: true },
  });
}

export class YearTakenError extends Error {}

export async function createYear(year: number, db: DbClient = prisma): Promise<void> {
  try {
    await db.academicYear.create({ data: { year } });
  } catch (error) {
    if (isUniqueViolation(error, "year")) throw new YearTakenError();
    throw error;
  }
}

export type SetCurrentResult = {
  changed: boolean;
  previousYear: number | null;
};

async function setCurrentWithDb(
  db: DbClient,
  year: number,
): Promise<SetCurrentResult> {
  const previousYear = await findCurrentYearForUpdate(db);
  if (previousYear === year) {
    return { changed: false, previousYear };
  }

  // 단일 현재 학년도 제약은 마이그레이션 SQL의 AcademicYear_single_current가 보장한다.
  await db.academicYear.updateMany({
    where: { isCurrent: true },
    data: { isCurrent: false },
  });
  await db.academicYear.update({ where: { year }, data: { isCurrent: true } });

  return { changed: true, previousYear };
}

export async function setCurrent(
  year: number,
  db?: DbClient,
): Promise<SetCurrentResult> {
  if (db) {
    return setCurrentWithDb(db, year);
  }

  return withTransaction((tx) => setCurrentWithDb(tx, year));
}
