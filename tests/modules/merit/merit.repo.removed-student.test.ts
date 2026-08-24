import { beforeEach, describe, expect, it, vi } from "vitest";

const studentProfileFindFirst = vi.fn();
const studentProfileFindMany = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: {
    studentProfile: {
      findFirst: studentProfileFindFirst,
      findMany: studentProfileFindMany,
    },
  },
}));

const repo = await import("@/modules/merit/merit.repo");

/**
 * 명단에서 빠진 학생을 어느 질의가 보고 어느 질의가 못 보는지.
 * 조회만 열고 부여는 막는다 — 그 경계가 여기 where 절에 있다.
 */
beforeEach(() => {
  studentProfileFindFirst.mockReset().mockResolvedValue(null);
  studentProfileFindMany.mockReset().mockResolvedValue([]);
});

/** 실제 질의에 넘어간 where 절. */
function whereOf(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return mock.mock.calls[0][0].where;
}

describe("searchStudents — 명단에서 빠진 학생은 옵트인해야 나온다", () => {
  it("기본은 지금과 같다", async () => {
    await repo.searchStudents("김", 2026, { includeRemoved: false });

    expect(whereOf(studentProfileFindMany).user).toEqual(
      expect.objectContaining({ deletedAt: null, role: "STUDENT" }),
    );
  });

  it("명시적으로 요청하면 조건을 빼되 학생 역할은 유지한다", async () => {
    await repo.searchStudents("김", 2026, { includeRemoved: true });

    const user = whereOf(studentProfileFindMany).user as Record<string, unknown>;
    expect(user).not.toHaveProperty("deletedAt");
    expect(user.role).toBe("STUDENT");
  });

  /** 화면이 "삭제됨"을 적으려면 재료가 있어야 한다. */
  it("명단 제외일을 함께 가져온다", async () => {
    await repo.searchStudents("김", 2026, { includeRemoved: true });

    expect(studentProfileFindMany.mock.calls[0][0].select.user.select).toEqual(
      expect.objectContaining({ name: true, deletedAt: true }),
    );
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

describe("findStudentHeader — 상세는 삭제된 학생도 보여준다", () => {
  it("deletedAt으로 거르지 않는다 (admin-users의 findDetail과 같은 규칙)", async () => {
    await repo.findStudentHeader("sp-1", 2026);

    expect(whereOf(studentProfileFindFirst)).toEqual({ id: "sp-1" });
  });

  it("명단 제외일을 removedAt으로 낸다", async () => {
    const removedAt = new Date("2026-08-01T00:00:00Z");
    studentProfileFindFirst.mockResolvedValue({
      id: "sp-1",
      studentCode: "K7M2XQ4A",
      user: { name: "김민준", deletedAt: removedAt },
      enrollments: [],
    });

    const header = await repo.findStudentHeader("sp-1", 2026);

    expect(header?.removedAt).toEqual(removedAt);
    expect(header?.name).toBe("김민준");
  });

  it("명단에 있는 학생의 removedAt은 null이다", async () => {
    studentProfileFindFirst.mockResolvedValue({
      id: "sp-1",
      studentCode: "K7M2XQ4A",
      user: { name: "김민준", deletedAt: null },
      enrollments: [
        { number: 7, status: "ENROLLED", schoolClass: { grade: 2, classNo: 3 } },
      ],
    });

    const header = await repo.findStudentHeader("sp-1", 2026);

    expect(header?.removedAt).toBeNull();
    expect(header?.grade).toBe(2);
  });
});

/**
 * 부여 경로는 열지 않는다. 명단에 없는 학생에게 새 상벌점을 주는 것은
 * 조회와 전혀 다른 일이고, 이 두 함수가 그 경계 전부다.
 */
describe("부여 대상 찾기 — 명단에 남아 있는 학생만", () => {
  it("findAwardableStudent는 지워진 계정을 거른다", async () => {
    await repo.findAwardableStudent("sp-1");

    expect(whereOf(studentProfileFindFirst)).toEqual({
      id: "sp-1",
      user: { deletedAt: null },
    });
  });

  it("findAwardableStudents(일괄)도 같은 조건이다", async () => {
    await repo.findAwardableStudents(["sp-1", "sp-2"]);

    expect(whereOf(studentProfileFindMany)).toEqual({
      id: { in: ["sp-1", "sp-2"] },
      user: { deletedAt: null },
    });
  });
});

/** 학생 본인 경로는 이번 변경에서 손대지 않았다 — 로그인 자체가 막힌다. */
describe("findStudentProfileByUserId — 본인 경로는 그대로", () => {
  it("여전히 지워진 계정을 거른다", async () => {
    await repo.findStudentProfileByUserId("u-1");

    expect(whereOf(studentProfileFindFirst)).toEqual({
      userId: "u-1",
      user: { deletedAt: null },
    });
  });
});
