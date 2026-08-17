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

/** 이미 있는 학년도를 또 만들려고 할 때. (admin-user.repo의 같은 이름과 짝을 이룬다) */
export class YearTakenError extends Error {}

export async function createYear(year: number): Promise<void> {
  try {
    await prisma.academicYear.create({ data: { year } });
  } catch (error) {
    // year는 @id라 유일 제약 위반이 PK 위반으로 온다 — 필드명은 다른 모듈과 같다.
    if (isUniqueViolation(error, "year")) throw new YearTakenError();
    throw error;
  }
}

/**
 * 현재 학년도를 옮긴다.
 *
 * 부분 유니크 인덱스(`isCurrent`가 true인 행은 하나)가 걸려 있어서
 * 먼저 전부 내리고 나서 올려야 한다. 순서를 뒤집으면 제약에 걸린다.
 *
 * 그 인덱스는 `AcademicYear_single_current`이고 마이그레이션 SQL에만 있다 —
 * Prisma가 부분 인덱스를 표현하지 못해 `schema.prisma`에는 선언이 없다.
 * 왜 그것이 조용히 사라질 수 있는지는 그 모델의 주석에 적어 뒀다. 인덱스가
 * 없어지면 이 순서는 그냥 무의미해지고(제약이 없으니 안 걸린다), 현재 학년도가
 * 둘인 상태가 아무 오류 없이 성립한다.
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
