import { prisma } from "@/core/db/client";
import { isUniqueViolation } from "@/core/db/unique-violation";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

export async function findCurrent() {
  return prisma.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
}

export async function listYears() {
  return prisma.academicYear.findMany({
    orderBy: { year: "desc" },
    select: { year: true, isCurrent: true },
  });
}

/** 이미 있는 학년도를 또 만들려고 할 때. */
export class YearTakenError extends Error {}

export async function createYear(year: number): Promise<void> {
  try {
    await prisma.academicYear.create({ data: { year } });
  } catch (error) {
    // year는 @id라 유일 제약 위반이 PK 위반으로 온다.
    if (isUniqueViolation(error, "year")) throw new YearTakenError();
    throw error;
  }
}

/**
 * 현재 학년도를 옮긴다. 부분 유니크 인덱스 `AcademicYear_single_current`가
 * 마이그레이션 SQL에만 있어(Prisma가 표현 못 한다) 다음 migrate dev가 DROP할 수
 * 있다. 없어지면 이 순서가 무의미해지고 현재 학년도가 둘인 상태가 성립한다.
 */
export async function setCurrent(year: number): Promise<void> {
  await prisma.$transaction([
    prisma.academicYear.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.academicYear.update({ where: { year }, data: { isCurrent: true } }),
  ]);
}
