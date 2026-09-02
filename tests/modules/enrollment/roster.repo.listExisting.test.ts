import { beforeEach, describe, expect, it, vi } from "vitest";

const studentProfileFindMany = vi.fn();
const enrollmentFindMany = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: {
    studentProfile: { findMany: studentProfileFindMany },
    enrollment: { findMany: enrollmentFindMany },
  },
}));

const { listExisting, listForExport } = await import(
  "@/modules/enrollment/roster.repo"
);

beforeEach(() => {
  studentProfileFindMany.mockReset();
  enrollmentFindMany.mockReset().mockResolvedValue([]);
});

describe("listExisting() — 이름을 NFC로 정규화한다 (I8)", () => {
  it("DB에 조합형(NFD)으로 저장된 이름도 완성형(NFC)으로 돌려준다", async () => {
    const nfdName = "김동혁".normalize("NFD");
    studentProfileFindMany.mockResolvedValue([
      {
        id: "sp-1",
        studentCode: "AAAA2345",
        birthDate: new Date("2010-07-28T00:00:00+09:00"),
        user: { id: "u-1", name: nfdName, status: "ACTIVE", deletedAt: null },
        enrollments: [],
      },
    ]);

    const result = await listExisting(2026);

    expect(result[0]!.name).toBe("김동혁".normalize("NFC"));
    expect(result[0]!.name).not.toBe(nfdName);
    expect(result[0]!.birthDate).toBe("2010-07-28");
    expect(result[0]!.hasGraduatedEnrollment).toBe(false);
    expect(result[0]!.removed).toBe(false);
    expect(result[0]).not.toHaveProperty("entryClassNo");
    expect(result[0]).not.toHaveProperty("entryNumber");
    expect(enrollmentFindMany).not.toHaveBeenCalled();
  });
});

describe("listExisting() — 제외 표시된 학생의 안전한 복구", () => {
  it("제외 학생도 학생코드 재매칭 대상으로 읽는다", async () => {
    studentProfileFindMany.mockResolvedValue([]);

    await listExisting(2026);

    const call = studentProfileFindMany.mock.calls[0]![0] as {
      where: { user: unknown };
      select: { enrollments: { where: unknown } };
    };
    expect(call.where).toEqual({ user: { role: "STUDENT" } });
    expect(call.select.enrollments.where).toEqual({
      OR: [{ year: 2026 }, { status: "GRADUATED" }],
    });
  });

  it("제외 학생은 매칭에는 돌려주되 명단 내보내기에서는 숨긴다", async () => {
    studentProfileFindMany.mockResolvedValue([
      {
        id: "sp-removed",
        studentCode: "BBBB2345",
        birthDate: new Date("2010-07-28T00:00:00+09:00"),
        user: {
          id: "u-removed",
          name: "제외학생",
          status: "INACTIVE",
          deletedAt: new Date("2026-09-02T00:00:00Z"),
        },
        enrollments: [],
      },
    ]);

    await expect(listExisting(2026)).resolves.toEqual([
      expect.objectContaining({ studentProfileId: "sp-removed", removed: true }),
    ]);
    await expect(listForExport(2026)).resolves.toEqual([]);
  });

  it("현재 학년도 배정과 별개로 어느 학년도든 졸업 기록이 있으면 표시한다", async () => {
    studentProfileFindMany.mockResolvedValue([
      {
        id: "sp-1",
        studentCode: "AAAA2345",
        birthDate: new Date("2010-07-28T00:00:00+09:00"),
        user: { id: "u-1", name: "김동혁", status: "ACTIVE", deletedAt: null },
        enrollments: [
          {
            year: 2025,
            grade: null,
            classNo: null,
            number: null,
            status: "GRADUATED",
          },
        ],
      },
    ]);

    const result = await listExisting(2026);

    expect(result[0]).toMatchObject({
      status: null,
      hasGraduatedEnrollment: true,
    });
  });
});

describe("listForExport() — 내보내기 참고 열", () => {
  it("가장 이른 1학년 반·번호를 내보내기 행에만 붙인다", async () => {
    studentProfileFindMany.mockResolvedValue([
      {
        id: "sp-1",
        studentCode: "AAAA2345",
        birthDate: new Date("2010-07-28T00:00:00+09:00"),
        user: { id: "u-1", name: "김동혁", status: "ACTIVE", deletedAt: null },
        enrollments: [
          {
            year: 2026,
            grade: 2,
            classNo: 4,
            number: 9,
            status: "ENROLLED",
          },
        ],
      },
    ]);
    enrollmentFindMany.mockResolvedValue([
      { studentProfileId: "sp-1", classNo: 5, number: 12 },
      { studentProfileId: "sp-1", classNo: 6, number: 13 },
    ]);

    const result = await listForExport(2026);

    expect(result[0]).toMatchObject({
      studentProfileId: "sp-1",
      grade: 2,
      classNo: 4,
      number: 9,
      entryClassNo: 5,
      entryNumber: 12,
    });
    expect(enrollmentFindMany).toHaveBeenCalledWith({
      where: { grade: 1 },
      orderBy: { year: "asc" },
      select: {
        studentProfileId: true,
        classNo: true,
        number: true,
      },
    });
  });
});
