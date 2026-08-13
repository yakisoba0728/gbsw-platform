import { prisma } from "@/core/db/client";

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

export async function createYear(year: number): Promise<void> {
  await prisma.academicYear.create({ data: { year } });
}

/**
 * 현재 학년도를 옮긴다.
 *
 * 부분 유니크 인덱스(`isCurrent`가 true인 행은 하나)가 걸려 있어서
 * 먼저 전부 내리고 나서 올려야 한다. 순서를 뒤집으면 제약에 걸린다.
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
