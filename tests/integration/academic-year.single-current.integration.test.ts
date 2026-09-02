import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { setCurrent } from "@/modules/academic-year/academic-year.repo";

const TEST_YEAR = 8104;
const CONCURRENT_YEAR = 8105;

describe("AcademicYear_single_current 부분 유니크 인덱스 (I7)", () => {
  beforeAll(async () => {
    await prisma.academicYear.createMany({
      data: [
        { year: TEST_YEAR, isCurrent: false },
        { year: CONCURRENT_YEAR, isCurrent: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma.academicYear.deleteMany({
      where: { year: { in: [TEST_YEAR, CONCURRENT_YEAR] } },
    });
    await prisma.academicYear.update({
      where: { year: 2026 },
      data: { isCurrent: true },
    });
  });

  it("setCurrent()는 제약에 걸리지 않고, 순서를 깨고 직접 바꾸면 인덱스가 막는다", async () => {
    const before = await prisma.academicYear.findUnique({ where: { year: 2026 } });
    expect(before?.isCurrent).toBe(true);

    await setCurrent(TEST_YEAR);

    const old = await prisma.academicYear.findUnique({ where: { year: 2026 } });
    const now = await prisma.academicYear.findUnique({ where: { year: TEST_YEAR } });
    expect(old?.isCurrent).toBe(false);
    expect(now?.isCurrent).toBe(true);

    await expect(
      prisma.academicYear.update({
        where: { year: 2026 },
        data: { isCurrent: true },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("병렬 전환은 직렬화되어 각 결과의 previousYear가 실제 직전 값을 가리킨다", async () => {
    await setCurrent(2026);

    const results = await Promise.all([
      setCurrent(TEST_YEAR),
      setCurrent(CONCURRENT_YEAR),
    ]);

    expect(results.every((result) => result.changed)).toBe(true);
    expect(results.map((result) => result.previousYear)).toContain(2026);
    expect(
      results.some((result) =>
        [TEST_YEAR, CONCURRENT_YEAR].includes(result.previousYear ?? -1),
      ),
    ).toBe(true);

    const current = await prisma.academicYear.findMany({
      where: { isCurrent: true },
      select: { year: true },
    });
    expect(current).toHaveLength(1);
    expect([TEST_YEAR, CONCURRENT_YEAR]).toContain(current[0]!.year);
  });
});
