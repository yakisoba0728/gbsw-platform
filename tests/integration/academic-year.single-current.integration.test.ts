import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { setCurrent } from "@/modules/academic-year/academic-year.repo";

/**
 * I7 — 부분 유니크 인덱스 `AcademicYear_single_current`
 * (`ON "AcademicYear" ("isCurrent") WHERE "isCurrent"`)가 실제로 걸리는지,
 * 그리고 setCurrent()가 "먼저 전부 내리고 나서 올리는" 두 문장 순서 덕분에
 * 그 제약에 걸리지 않는지를 검증한다.
 *
 * gbsw_test는 마이그레이션(20260813005023_academic_year_and_enrollment)이
 * AcademicYear(2026, isCurrent: true)를 시드로 심어 둔다 — 실치 직후의
 * 기본 상태(M9)와 같다. 이 테스트는 그 행의 isCurrent를 건드렸다가
 * afterAll에서 반드시 원래 값(true)으로 되돌린다 — "자기가 만든 행만
 * 지운다"는 원칙과 별개로, 시드 행은 지우는 게 아니라 복원하는 예외다.
 */

const TEST_YEAR = 8104;

describe("AcademicYear_single_current 부분 유니크 인덱스 (I7)", () => {
  beforeAll(async () => {
    await prisma.academicYear.create({
      data: { year: TEST_YEAR, isCurrent: false },
    });
  });

  afterAll(async () => {
    await prisma.academicYear.deleteMany({ where: { year: TEST_YEAR } });
    await prisma.academicYear.update({
      where: { year: 2026 },
      data: { isCurrent: true },
    });
  });

  it("setCurrent()는 제약에 걸리지 않고, 순서를 깨고 직접 바꾸면 인덱스가 막는다", async () => {
    const before = await prisma.academicYear.findUnique({ where: { year: 2026 } });
    expect(before?.isCurrent).toBe(true); // 시드 상태 전제 확인.

    await setCurrent(TEST_YEAR);

    const old = await prisma.academicYear.findUnique({ where: { year: 2026 } });
    const now = await prisma.academicYear.findUnique({ where: { year: TEST_YEAR } });
    expect(old?.isCurrent).toBe(false);
    expect(now?.isCurrent).toBe(true);

    // 지금은 TEST_YEAR만 isCurrent다. setCurrent()의 순서(전부 내리고 나서
    // 올리기) 없이 2026을 그냥 true로 바꾸면 두 행이 동시에 true가 되어
    // 부분 유니크 인덱스가 막아야 한다.
    await expect(
      prisma.academicYear.update({
        where: { year: 2026 },
        data: { isCurrent: true },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
