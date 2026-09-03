import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { DECIDABLE_STATUSES, LIVE_STATUSES } from "@/modules/pass/pass.policy";

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

    await repo.listPendingForAdmin(
      now,
      2026,
      { cursor: null, take: 50 },
      { pass: { findMany, count } } as never,
    );

    expect(findMany.mock.calls[0]![0].where.status.in).toEqual([...DECIDABLE_STATUSES]);
    expect(count.mock.calls[0]![0].where.status.in).toEqual([...DECIDABLE_STATUSES]);
  });
});

describe("transitionUnexpired SQL", () => {
  it("만료 판정과 대입은 세션 TimeZone의 해석을 거치지 않는다", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    queryRaw.mockResolvedValueOnce([
      { id: "p-1", status: "REQUESTED", expired: false },
    ]);

    await expect(
      repo.transitionUnexpired(
        "p-1",
        ["REQUESTED"],
        { status: "APPROVED" },
        { $queryRaw: queryRaw, $executeRaw: executeRaw } as never,
      ),
    ).resolves.toBe("UPDATED");

    const selectSql = sqlAt(0);
    expect(selectSql).toContain("FOR UPDATE");
    // Prisma DateTime은 시간대 없는 TIMESTAMP(3)라 UTC 값을 담는다 — 컬럼을
    // 명시적으로 UTC로 풀어 clock_timestamp와 절대시각끼리 비교해야
    // DB 세션 TZ가 Asia/Seoul이어도 만료 판정이 9시간 어긋나지 않는다.
    expect(selectSql).toContain(`("endAt" AT TIME ZONE 'UTC') <= clock_timestamp()`);
    expect(selectSql).not.toMatch(/"endAt"\s*<=\s*clock_timestamp\(\)/);

    const updateSql = executeRaw.mock.calls[0]![0].sql as string;
    expect(updateSql).toContain(
      `"updatedAt" = (clock_timestamp() AT TIME ZONE 'UTC')`,
    );
    expect(updateSql).toContain(
      `("endAt" AT TIME ZONE 'UTC') > clock_timestamp()`,
    );
    expect(updateSql).not.toMatch(/"updatedAt"\s*=\s*clock_timestamp\(\)/);
    expect(updateSql).not.toMatch(/"endAt"\s*>\s*clock_timestamp\(\)/);
  });

  it("잠긴 행이 전이 대상이 아니면 UPDATE를 실행하지 않는다", async () => {
    const executeRaw = vi.fn();
    queryRaw.mockResolvedValueOnce([
      { id: "p-1", status: "APPROVED", expired: false },
    ]);

    await expect(
      repo.transitionUnexpired(
        "p-1",
        ["REQUESTED"],
        { status: "APPROVED" },
        { $queryRaw: queryRaw, $executeRaw: executeRaw } as never,
      ),
    ).resolves.toBe("UNCHANGED");
    expect(executeRaw).not.toHaveBeenCalled();
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

describe("displayYear — 표시 학년도", () => {
  it("학년도가 없으면 매직 0 대신 null을 반환한다", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      repo.displayYear({ academicYear: { findFirst } } as never),
    ).resolves.toBeNull();
  });

  it("표시 학년도가 없으면 학년·반·번호를 좁히지 않는다", async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    await repo.listForVerify("sp-1", new Date(), null, {
      pass: { findMany },
    } as never);

    expect(findMany.mock.calls[0]![0].include.studentProfile.select.enrollments.where).toEqual(
      { year: { in: [] } },
    );
  });
});

describe("UNEXPIRED_TRANSITION_COLUMNS — 스키마 파생 검증", () => {
  type TransitionColumns = typeof repo.UNEXPIRED_TRANSITION_COLUMNS;

  it("키와 값은 모두 Prisma 스키마의 Pass 필드로 대입 호환이다", () => {
    expectTypeOf<keyof TransitionColumns>().toExtend<keyof Prisma.PassUncheckedUpdateManyInput>();
    expectTypeOf<TransitionColumns[keyof TransitionColumns]>().toExtend<Prisma.PassScalarFieldEnum>();
  });

  it("Pass 모델에 @map이 없으므로 필드명과 컬럼명이 어긋나지 않는다", () => {
    const fieldEnum: Record<string, string> = Prisma.PassScalarFieldEnum;
    for (const [field, column] of Object.entries(repo.UNEXPIRED_TRANSITION_COLUMNS)) {
      expect(field).toBe(column);
      expect(fieldEnum).toHaveProperty(field, column);
    }
  });
});

describe("교사 현황 목록의 커서", () => {
  const now = new Date("2026-09-02T12:00:00+09:00");

  function passRows(ids: string[]) {
    return ids.map((id) => ({ id }));
  }

  function db(rows: { id: string }[], total = rows.length) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const count = vi.fn().mockResolvedValue(total);
    return { findMany, count, client: { pass: { findMany, count } } as never };
  }

  it("첫 페이지는 커서 없이 다음 쪽 확인용 한 건만 더 읽는다", async () => {
    const { findMany, client } = db(passRows(["a", "b", "c"]));

    const page = await repo.listPendingForAdmin(
      now,
      2026,
      { cursor: null, take: 2 },
      client,
    );

    const args = findMany.mock.calls[0]![0];
    expect(args.take).toBe(3);
    expect(args.cursor).toBeUndefined();
    expect(args.skip).toBeUndefined();
    expect(page.entries.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(page.nextCursor).toBe("b");
  });

  it("마지막 페이지의 nextCursor는 null이다", async () => {
    const { client } = db(passRows(["a", "b"]));

    const page = await repo.listPendingForAdmin(
      now,
      2026,
      { cursor: null, take: 2 },
      client,
    );

    expect(page.entries).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("커서를 받으면 그 행부터 읽고 맨 앞의 커서 행만 버린다", async () => {
    const { findMany, client } = db(passRows(["b", "c", "d", "e"]));

    const page = await repo.listPendingForAdmin(
      now,
      2026,
      { cursor: "b", take: 2 },
      client,
    );

    const args = findMany.mock.calls[0]![0];
    expect(args.cursor).toEqual({ id: "b" });
    // 커서 행 한 건 + 다음 쪽 확인용 한 건을 더 읽는다.
    expect(args.take).toBe(4);
    // skip: 1은 쓰지 않는다 — 커서 행이 목록에서 빠졌을 때 다음 한 건을 대신 삼킨다.
    expect(args.skip).toBeUndefined();
    expect(page.entries.map((entry) => entry.id)).toEqual(["c", "d"]);
    expect(page.nextCursor).toBe("d");
  });

  it("커서 행이 목록에서 빠졌으면 한 건도 건너뛰지 않는다", async () => {
    // 커서였던 b가 승인되어 결재 대기에서 사라진 경우 — 첫 행은 c다.
    const { client } = db(passRows(["c", "d", "e"]));

    const page = await repo.listPendingForAdmin(
      now,
      2026,
      { cursor: "b", take: 2 },
      client,
    );

    expect(page.entries.map((entry) => entry.id)).toEqual(["c", "d"]);
    expect(page.nextCursor).toBe("d");
  });

  it("전체 건수는 커서와 무관하게 where로만 센다", async () => {
    const { count, client } = db(passRows(["c", "d", "e"]), 327);

    const page = await repo.listPendingForAdmin(
      now,
      2026,
      { cursor: "b", take: 2 },
      client,
    );

    expect(count.mock.calls[0]![0].where).toBeDefined();
    expect(count.mock.calls[0]![0]).not.toHaveProperty("cursor");
    expect(page.total).toBe(327);
  });

  it("두 목록의 커서는 서로 섞이지 않는다", async () => {
    const { findMany, client } = db(passRows(["x"]));

    await repo.listPendingForAdmin(now, 2026, { cursor: "p-9", take: 50 }, client);
    await repo.listActiveNow(now, 2026, { cursor: "a-9", take: 50 }, client);

    const pendingArgs = findMany.mock.calls[0]![0];
    const activeArgs = findMany.mock.calls[1]![0];
    expect(pendingArgs.cursor).toEqual({ id: "p-9" });
    expect(pendingArgs.orderBy).toEqual([{ startAt: "asc" }, { id: "asc" }]);
    expect(activeArgs.cursor).toEqual({ id: "a-9" });
    expect(activeArgs.orderBy).toEqual([{ endAt: "asc" }, { id: "asc" }]);
  });
});
