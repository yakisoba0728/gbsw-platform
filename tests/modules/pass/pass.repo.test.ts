import { beforeEach, describe, expect, it, vi } from "vitest";
import { DECIDABLE_STATUSES, LIVE_STATUSES } from "@/core/authz/pass-type";

vi.mock("@/core/db/client", () => ({
  prisma: {},
  withTransaction: vi.fn(),
}));

const repo = await import("@/modules/pass/pass.repo");

const queryRaw = vi.fn();

beforeEach(() => {
  queryRaw.mockReset();
});

function sqlAt(index: number): string {
  return queryRaw.mock.calls[index]![0].join(" ");
}

describe("출입증 상태 집합", () => {
  const now = new Date("2026-09-02T12:00:00+09:00");

  it("살아 있는 상태는 신청·동의·승인 세 가지다", () => {
    expect(LIVE_STATUSES).toEqual(["REQUESTED", "CONSENTED", "APPROVED"]);
  });

  it("정문 판정은 LIVE_STATUSES와 같은 상태를 쓴다", async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    await repo.listForVerify("sp-1", now, 2026, {
      pass: { findMany },
    } as never);

    expect(findMany.mock.calls[0]![0].where.status.in).toEqual([...LIVE_STATUSES]);
  });

  it("학생 대시보드는 LIVE_STATUSES와 같은 상태를 쓴다", async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    await repo.listLiveForStudent("sp-1", now, 2026, 5, {
      pass: { findMany },
    } as never);

    expect(findMany.mock.calls[0]![0].where.status.in).toEqual([...LIVE_STATUSES]);
  });

  it("겹침 검사는 LIVE_STATUSES와 같은 상태를 쓴다", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);

    await repo.findOverlapping(
      "sp-1",
      new Date("2026-09-02T13:00:00+09:00"),
      new Date("2026-09-02T14:00:00+09:00"),
      { pass: { findFirst } } as never,
    );

    expect(findFirst.mock.calls[0]![0].where.status.in).toEqual([...LIVE_STATUSES]);
  });

  it("교사 결재 대기는 DECIDABLE_STATUSES와 같은 상태를 쓴다", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);

    await repo.listPendingForAdmin(now, 2026, {
      pass: { findMany, count },
    } as never);

    expect(findMany.mock.calls[0]![0].where.status.in).toEqual([...DECIDABLE_STATUSES]);
    expect(count.mock.calls[0]![0].where.status.in).toEqual([...DECIDABLE_STATUSES]);
  });
});

describe("출입증 생성 잠금 순서", () => {
  it("학생 신청은 User를 먼저 잠그고 StudentProfile을 잠근다", async () => {
    queryRaw
      .mockResolvedValueOnce([{ id: "u-1" }])
      .mockResolvedValueOnce([{ id: "sp-1" }]);

    await expect(
      repo.lockStudentForPassCreation("sp-1", { $queryRaw: queryRaw } as never),
    ).resolves.toBe(true);

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(sqlAt(0)).toContain('FROM "user"');
    expect(sqlAt(1)).toContain('FROM "StudentProfile"');
  });

  it("직접 부여는 User → StudentProfile → Enrollment 순으로 잠그고 학생 역할도 확인한다", async () => {
    queryRaw
      .mockResolvedValueOnce([{ id: "u-1" }])
      .mockResolvedValueOnce([{ id: "sp-1" }])
      .mockResolvedValueOnce([{ id: "e-1" }]);

    await expect(
      repo.lockEligibleStudentForPassCreation(
        "sp-1",
        2026,
        { $queryRaw: queryRaw } as never,
      ),
    ).resolves.toBe(true);

    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(sqlAt(0)).toContain('FROM "user"');
    expect(sqlAt(0)).toContain('"role" = \'STUDENT\'');
    expect(sqlAt(1)).toContain('FROM "StudentProfile"');
    expect(sqlAt(2)).toContain('FROM "Enrollment"');
  });
});

describe("출입증 학적 조회", () => {
  it("직접 부여 학생을 학년→반→번호 순으로 조회하고 미배정 null을 보존한다", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        grade: 1,
        classNo: 2,
        number: 3,
        studentProfile: { id: "sp-1", user: { name: "김학생" } },
      },
      {
        grade: null,
        classNo: null,
        number: null,
        studentProfile: { id: "sp-2", user: { name: "미배정" } },
      },
    ]);

    const students = await repo.listEnrolledStudents(2026, {
      enrollment: { findMany },
    } as never);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        year: 2026,
        status: "ENROLLED",
        studentProfile: {
          user: { role: "STUDENT", deletedAt: null, status: "ACTIVE" },
        },
      },
      select: {
        grade: true,
        classNo: true,
        number: true,
        studentProfile: { select: { id: true, user: { select: { name: true } } } },
      },
      orderBy: [{ grade: "asc" }, { classNo: "asc" }, { number: "asc" }],
    });
    expect(students).toEqual([
      { id: "sp-1", name: "김학생", grade: 1, classNo: 2, number: 3 },
      {
        id: "sp-2",
        name: "미배정",
        grade: null,
        classNo: null,
        number: null,
      },
    ]);
  });

  it("학번 검색은 같은 학년도의 grade·classNo·number 스칼라를 모두 좁힌다", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);

    await repo.listHistory(
      {
        q: "2305",
        studentNumber: { grade: 2, classNo: 3, number: 5 },
        since: undefined,
        until: null,
        skip: 0,
        take: 20,
      },
      2026,
      { pass: { findMany, count } } as never,
    );

    const expectedWhere = {
      OR: [
        {
          studentProfile: {
            user: { name: { contains: "2305", mode: "insensitive" } },
          },
        },
        {
          studentProfile: {
            enrollments: {
              some: { year: 2026, grade: 2, classNo: 3, number: 5 },
            },
          },
        },
      ],
    };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
  });
});
