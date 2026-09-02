import { beforeEach, describe, expect, it, vi } from "vitest";

const studentProfileFindFirst = vi.fn();
const studentProfileFindMany = vi.fn();
const parentStudentFindMany = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: {
    studentProfile: {
      findFirst: studentProfileFindFirst,
      findMany: studentProfileFindMany,
    },
    parentStudent: { findMany: parentStudentFindMany },
  },
}));

const repo = await import("@/modules/merit/merit.repo");

beforeEach(() => {
  studentProfileFindFirst.mockReset().mockResolvedValue(null);
  studentProfileFindMany.mockReset().mockResolvedValue([]);
  parentStudentFindMany.mockReset().mockResolvedValue([]);
});

function whereOf(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return mock.mock.calls[0][0].where;
}

describe("searchStudents — 명단에서 빠진 학생은 옵트인해야 나온다", () => {
  it("기본은 그 학년도 재적만 낸다", async () => {
    await repo.searchStudents("김", 2026, { includeRemoved: false });

    const where = whereOf(studentProfileFindMany);
    expect(where.user).toEqual({ role: "STUDENT" });
    expect(where.enrollments).toEqual({
      some: { year: 2026, status: "ENROLLED" },
    });
  });

  it("명시적으로 요청하면 조건을 빼되 학생 역할은 유지한다", async () => {
    await repo.searchStudents("김", 2026, { includeRemoved: true });

    const where = whereOf(studentProfileFindMany);
    expect(where).not.toHaveProperty("enrollments");
    expect(where.user).toEqual({ role: "STUDENT" });
  });

  it("그 학년도 재적 줄을 함께 가져온다 (학적 표시의 재료)", async () => {
    await repo.searchStudents("김", 2026, { includeRemoved: true });

    const select = studentProfileFindMany.mock.calls[0][0].select;
    expect(select.user.select).toEqual({ name: true });
    expect(select.enrollments).toEqual(
      expect.objectContaining({ where: { year: 2026 }, take: 1 }),
    );
    expect(select.enrollments.where).not.toHaveProperty("status");
  });
});

describe("searchStudents — 학번 갈래", () => {
  it("학번을 주면 그 학년도 재적에 학년·반·번호를 건다", async () => {
    await repo.searchStudents("2305", 2026, {
      includeRemoved: false,
      studentNumber: { grade: 2, classNo: 3, number: 5 },
    });

    const or = whereOf(studentProfileFindMany).OR as Record<string, unknown>[];
    expect(or).toHaveLength(3);
    expect(or[2]).toEqual({
      enrollments: {
        some: { year: 2026, grade: 2, classNo: 3, number: 5 },
      },
    });
  });

  it("안 주면 이름·학생코드 두 갈래뿐이다", async () => {
    await repo.searchStudents("김", 2026, { includeRemoved: false });

    expect(whereOf(studentProfileFindMany).OR).toHaveLength(2);
  });
});

describe("findStudentHeader — 상세는 명단에서 빠진 학생도 보여준다", () => {
  it("재적으로 거르지 않는다 (admin-users의 findDetail과 같은 규칙)", async () => {
    await repo.findStudentHeader("sp-1", 2026);

    expect(whereOf(studentProfileFindFirst)).toEqual({ id: "sp-1" });
  });

  it("머리글 학적은 요청한 학년도의 한 줄로 좁힌다", async () => {
    const histories = [
      {
        year: 2025,
        grade: 1,
        classNo: 1,
        number: 3,
        status: "ENROLLED",
      },
      {
        year: 2026,
        grade: 2,
        classNo: 3,
        number: 7,
        status: "EXPELLED",
      },
    ];
    studentProfileFindFirst.mockImplementation(
      (args: {
        select: { enrollments: { where?: { year?: number }; take: number } };
      }) => {
        const requestedYear = args.select.enrollments.where?.year;
        const selected = (requestedYear === undefined
          ? histories
          : histories.filter((row) => row.year === requestedYear)
        ).slice(0, args.select.enrollments.take);

        return {
          id: "sp-1",
          studentCode: "K7M2XQ4A",
          user: { name: "김민준" },
          enrollments: selected.map((row) => ({
            grade: row.grade,
            classNo: row.classNo,
            number: row.number,
            status: row.status,
          })),
        };
      },
    );

    const header = await repo.findStudentHeader("sp-1", 2026);
    const enrollmentSelect = studentProfileFindFirst.mock.calls[0][0].select.enrollments;

    expect(enrollmentSelect).toEqual(
      expect.objectContaining({ where: { year: 2026 }, take: 1 }),
    );
    expect(header).toEqual(
      expect.objectContaining({
        grade: 2,
        classNo: 3,
        number: 7,
        status: "EXPELLED",
        removed: true,
      }),
    );
  });

  it("재적이 아니면 removed가 true다", async () => {
    studentProfileFindFirst.mockResolvedValue({
      id: "sp-1",
      studentCode: "K7M2XQ4A",
      user: { name: "김민준" },
      enrollments: [
        { grade: null, classNo: null, number: null, status: "EXPELLED" },
      ],
    });

    const header = await repo.findStudentHeader("sp-1", 2026);

    expect(header?.removed).toBe(true);
    expect(header?.status).toBe("EXPELLED");
    expect(header?.name).toBe("김민준");
  });

  it("그 학년도 재적 줄이 아예 없어도 removed다", async () => {
    studentProfileFindFirst.mockResolvedValue({
      id: "sp-1",
      studentCode: "K7M2XQ4A",
      user: { name: "김민준" },
      enrollments: [],
    });

    const header = await repo.findStudentHeader("sp-1", 2026);

    expect(header?.removed).toBe(true);
    expect(header?.status).toBeNull();
  });

  it("재학이면 removed는 false다", async () => {
    studentProfileFindFirst.mockResolvedValue({
      id: "sp-1",
      studentCode: "K7M2XQ4A",
      user: { name: "김민준" },
      enrollments: [
        { grade: 2, classNo: 3, number: 7, status: "ENROLLED" },
      ],
    });

    const header = await repo.findStudentHeader("sp-1", 2026);

    expect(header?.removed).toBe(false);
    expect(header?.grade).toBe(2);
  });
});

describe("부여 대상 찾기 — 그 학년도 재적 학생만", () => {
  it("findAwardableStudent는 그 학년도 재적을 요구한다", async () => {
    await repo.findAwardableStudent("sp-1", 2026);

    expect(whereOf(studentProfileFindFirst)).toEqual({
      id: "sp-1",
      enrollments: { some: { year: 2026, status: "ENROLLED" } },
    });
  });

  it("findAwardableStudents(일괄)도 같은 조건이다", async () => {
    await repo.findAwardableStudents(["sp-1", "sp-2"], 2026);

    expect(whereOf(studentProfileFindMany)).toEqual({
      id: { in: ["sp-1", "sp-2"] },
      enrollments: { some: { year: 2026, status: "ENROLLED" } },
    });
  });

  it("넘긴 학년도를 그대로 건다", async () => {
    await repo.findAwardableStudent("sp-1", 2025);

    expect(whereOf(studentProfileFindFirst)).toEqual({
      id: "sp-1",
      enrollments: { some: { year: 2025, status: "ENROLLED" } },
    });
  });

  it("db를 주면 그 클라이언트로 묻는다", async () => {
    const txFindFirst = vi.fn().mockResolvedValue(null);
    const tx = { studentProfile: { findFirst: txFindFirst } } as unknown as Parameters<
      typeof repo.findAwardableStudent
    >[2];

    await repo.findAwardableStudent("sp-1", 2026, tx);

    expect(txFindFirst).toHaveBeenCalledTimes(1);
    expect(studentProfileFindFirst).not.toHaveBeenCalled();
  });
});

describe("본인·자녀 경로는 명단 술어를 걸지 않는다", () => {
  it("findStudentProfileByUserId는 userId만 본다", async () => {
    await repo.findStudentProfileByUserId("u-1");

    expect(whereOf(studentProfileFindFirst)).toEqual({ userId: "u-1" });
  });

  it("listChildren은 연결만 본다", async () => {
    await repo.listChildren("p-1");

    expect(whereOf(parentStudentFindMany)).toEqual({ parentUserId: "p-1" });
  });
});
