import { beforeEach, describe, expect, it, vi } from "vitest";

const studentProfileFindMany = vi.fn();
const enrollmentFindMany = vi.fn();

// applyRoster()는 별도 파일(roster.repo.test.ts)에서 $transaction을 흉내 내
// 테스트한다 — listExisting()은 트랜잭션 밖에서 도는 단순 조회라 그 목과
// 섞이지 않게 파일을 분리했다.
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
    expect(result[0]).not.toHaveProperty("deleted");
    expect(result[0]).not.toHaveProperty("entryClassNo");
    expect(result[0]).not.toHaveProperty("entryNumber");
    expect(enrollmentFindMany).not.toHaveBeenCalled();
  });
});

describe("listExisting() — 삭제 표시된 학생은 명단 매칭에 쓰지 않는다", () => {
  it("WHERE에 deletedAt: null을 넣어 legacy 삭제 표시 계정 재매칭 경로를 만들지 않는다", async () => {
    studentProfileFindMany.mockResolvedValue([]);

    await listExisting(2026);

    const call = studentProfileFindMany.mock.calls[0]![0] as {
      where: { user: unknown };
      select: { enrollments: { where: unknown } };
    };
    expect(call.where).toEqual({ user: { role: "STUDENT", deletedAt: null } });
    expect(call.select.enrollments.where).toEqual({
      OR: [{ year: 2026 }, { status: "GRADUATED" }],
    });
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
