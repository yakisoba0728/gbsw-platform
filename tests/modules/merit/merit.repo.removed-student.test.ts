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

/**
 * 명단에서 빠진 학생을 어느 질의가 보고 어느 질의가 못 보는지.
 * 조회만 열고 부여는 막는다 — 그 경계가 여기 where 절에 있다.
 *
 * **「빠졌다」의 뜻이 바뀌었다.** 예전에는 `user.deletedAt`이 찍힌 계정이었는데,
 * 그 값을 채우는 코드가 하나도 없어 어떤 퇴학생도 못 걸렀다. 지금은 **그 학년도
 * 재적(`Enrollment.status == "ENROLLED"`)이 아닌 학생**이고, 명단 반영이 퇴학·전학
 * 학생에게 실제로 남기는 상태가 그것이다. 아래 테스트가 그 술어를 못 박는다.
 */
beforeEach(() => {
  studentProfileFindFirst.mockReset().mockResolvedValue(null);
  studentProfileFindMany.mockReset().mockResolvedValue([]);
  parentStudentFindMany.mockReset().mockResolvedValue([]);
});

/** 실제 질의에 넘어간 where 절. */
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

  /**
   * 화면은 빠진 학생의 빈 학급 자리에 학적을 적는다 — 그 재료가 재적 줄이다.
   * 계정의 삭제 표시를 가져오던 자리를 이것이 대신한다.
   */
  it("그 학년도 재적 줄을 함께 가져온다 (학적 표시의 재료)", async () => {
    await repo.searchStudents("김", 2026, { includeRemoved: true });

    const select = studentProfileFindMany.mock.calls[0][0].select;
    expect(select.user.select).toEqual({ name: true });
    expect(select.enrollments).toEqual(
      expect.objectContaining({ where: { year: 2026 }, take: 1 }),
    );
    // 학적으로 거르지 않는다 — 걸러 오면 "반 미배정"과 "졸업"을 구분할 수 없다.
    expect(select.enrollments.where).not.toHaveProperty("status");
  });
});

/**
 * 학번 갈래. 파싱은 서비스가 하고 여기는 받은 값을 거는 일만 한다 —
 * 그 학년도 재적에 걸어야 한다: year를 빼면 작년 번호로 남의 학생이 나온다.
 */
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
        some: { year: 2026, number: 5, schoolClass: { grade: 2, classNo: 3 } },
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
        number: 3,
        status: "ENROLLED",
        schoolClass: { grade: 1, classNo: 1 },
      },
      {
        year: 2026,
        number: 7,
        status: "EXPELLED",
        schoolClass: { grade: 2, classNo: 3 },
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
            number: row.number,
            status: row.status,
            schoolClass: row.schoolClass,
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
      enrollments: [{ number: null, status: "EXPELLED", schoolClass: null }],
    });

    const header = await repo.findStudentHeader("sp-1", 2026);

    expect(header?.removed).toBe(true);
    expect(header?.status).toBe("EXPELLED");
    expect(header?.name).toBe("김민준");
  });

  /** 학년도가 막 넘어가 재적 줄 자체가 없는 상태도 「빠진」 쪽이다. */
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
        { number: 7, status: "ENROLLED", schoolClass: { grade: 2, classNo: 3 } },
      ],
    });

    const header = await repo.findStudentHeader("sp-1", 2026);

    expect(header?.removed).toBe(false);
    expect(header?.grade).toBe(2);
  });
});

/**
 * 부여 경로는 열지 않는다. 명단에 없는 학생에게 새 상벌점을 주는 것은
 * 조회와 전혀 다른 일이고, 이 두 함수가 그 경계 전부다.
 *
 * **술어가 재적인 것이 요점이다.** 계정 조건(deletedAt)을 보던 시절에는 퇴학생이
 * 그대로 통과했다 — 명단 반영이 그 값을 채우지 않기 때문이다.
 */
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

  /** 호출부는 잠근 학년도를 넘긴다 — 조건에 그대로 실려야 한다. */
  it("넘긴 학년도를 그대로 건다", async () => {
    await repo.findAwardableStudent("sp-1", 2025);

    expect(whereOf(studentProfileFindFirst)).toEqual({
      id: "sp-1",
      enrollments: { some: { year: 2025, status: "ENROLLED" } },
    });
  });

  /** 트랜잭션 클라이언트를 주면 그쪽으로 간다 — 잠금 밖에서 검사하면 안 된다. */
  it("db를 주면 그 클라이언트로 묻는다", async () => {
    const txFindFirst = vi.fn().mockResolvedValue(null);
    // 트랜잭션 클라이언트의 쓰는 부분만 흉내 낸 목이다.
    const tx = { studentProfile: { findFirst: txFindFirst } } as unknown as Parameters<
      typeof repo.findAwardableStudent
    >[2];

    await repo.findAwardableStudent("sp-1", 2026, tx);

    expect(txFindFirst).toHaveBeenCalledTimes(1);
    expect(studentProfileFindFirst).not.toHaveBeenCalled();
  });
});

/**
 * 본인·자녀 경로는 거르지 않는다. 재적을 걸면 졸업한 순간 자기 기록도, 부모가
 * 보던 자녀 기록도 닿을 길이 사라진다 — 부여를 막는 것과 다른 질문이다.
 */
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
