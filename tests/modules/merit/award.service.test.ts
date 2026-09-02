import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDateInputKst } from "@/lib/datetime";
import { schoolYearMonths, schoolYearRange } from "@/modules/merit/merit.chart";
import { BULK_AWARD_LIMIT } from "@/modules/merit/merit.schema";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

const findRuleForUpdate = vi.fn();
const findCurrentYearForUpdate = vi.fn();
const createAward = vi.fn();
const findAward = vi.fn();
const cancelAward = vi.fn();
const listAwards = vi.fn();
const totals = vi.fn();
const findStudentProfileByUserId = vi.fn();
const findAwardableStudent = vi.fn();
const findAwardableStudents = vi.fn();
const getCurrentYear = vi.fn();
const createAwards = vi.fn();
const {
  recordAudit,
  txClient,
  prewiredWithTransaction: withTransaction,
} = coreMocks("merit-award-service-test");
const listClassRoster = vi.fn();
const searchStudents = vi.fn();
const listChildren = vi.fn();
const isChildOf = vi.fn();
const listAwardYears = vi.fn();
const findRecentAwardPage = vi.fn();
const countRecentAwards = vi.fn();
const findRecentAwardsForExport = vi.fn();
const findStudentHeader = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  findRuleForUpdate,
  findCurrentYearForUpdate,
  createAward,
  findAward,
  cancelAward,
  listAwards,
  totals,
  findStudentProfileByUserId,
  findAwardableStudent,
  findAwardableStudents,
  createAwards,
  listClassRoster,
  searchStudents,
  listChildren,
  isChildOf,
  listAwardYears,
  findRecentAwardPage,
  countRecentAwards,
  findRecentAwardsForExport,
  findStudentHeader,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear,
  AcademicYearError: class extends Error {},
}));

const { MeritError } = await import("@/modules/merit/merit.error");
const service = await import("@/modules/merit/award.service");

const admin = user("ADMIN", "admin-1", { name: "이정민" });
const other = user("ADMIN", "admin-2", { name: "이정민" });
const student = user("STUDENT", "u-1", { name: "이정민" });

const SCHOOL_RULE = {
  id: "r-1",
  track: "SCHOOL",
  kind: "MERIT",
  label: "교내 봉사활동 우수 참여",
  points: 5,
  category: "봉사",
  description: null,
  active: true,
};

beforeEach(() => {
  getCurrentYear.mockReset().mockResolvedValue(2026);
  findRuleForUpdate.mockReset().mockResolvedValue(SCHOOL_RULE);
  findCurrentYearForUpdate.mockReset().mockResolvedValue(2026);
  createAward.mockReset().mockResolvedValue({ id: "a-1" });
  findAward.mockReset().mockResolvedValue({
    id: "a-1",
    studentProfileId: "sp-1",
    track: "SCHOOL",
    kind: "MERIT",
    label: "교내 봉사활동 우수 참여",
    points: 5,
    status: "ACTIVE",
    studentProfile: { user: { name: "김민준" } },
  });
  cancelAward.mockReset().mockResolvedValue(1);
  listAwards.mockReset().mockResolvedValue([]);
  totals.mockReset().mockResolvedValue([]);
  findStudentProfileByUserId.mockReset().mockResolvedValue({
    id: "sp-1",
    user: { name: "김민준" },
  });
  findAwardableStudent.mockReset().mockResolvedValue({
    id: "sp-1",
    studentCode: "K7M2XQ4A",
    user: { id: "u-1", name: "김민준" },
  });
  findAwardableStudents
    .mockReset()
    .mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({ id, studentCode: "CODE", user: { id: `u-${id}`, name: `학생${id}` } })),
    );
  recordAudit.mockReset().mockResolvedValue(undefined);
  withTransaction.mockClear();
  createAwards.mockReset().mockResolvedValue([{ id: "a-1" }, { id: "a-2" }]);
  listClassRoster.mockReset().mockResolvedValue([]);
  searchStudents.mockReset().mockResolvedValue([]);
  listChildren.mockReset().mockResolvedValue([]);
  isChildOf.mockReset().mockResolvedValue(true);
  listAwardYears.mockReset().mockResolvedValue([2026, 2025]);
  findRecentAwardPage.mockReset().mockResolvedValue([]);
  countRecentAwards.mockReset().mockResolvedValue(0);
  findRecentAwardsForExport.mockReset().mockResolvedValue([]);
  findStudentHeader.mockReset().mockResolvedValue(HEADER);
});

const HEADER = {
  studentProfileId: "sp-1",
  studentCode: "K7M2XQ4A",
  name: "김민준",
  grade: 2,
  classNo: 3,
  number: 7,
  status: "ENROLLED",
  removed: false,
};

const NOW = new Date("2026-08-16T10:00:00+09:00");
const OCCURRED_ON = parseDateInputKst("2026-08-16");

const awardInput = {
  studentProfileId: "sp-1",
  ruleId: "r-1",
  note: null,
};

describe("awardMerit", () => {
  it("규정 값을 스냅샷해서 넣는다", async () => {
    await service.awardMerit(admin, awardInput, NOW);

    expect(createAward).toHaveBeenCalledWith(
      expect.objectContaining({
        studentProfileId: "sp-1",
        year: 2026,
        ruleId: "r-1",
        track: "SCHOOL",
        kind: "MERIT",
        label: "교내 봉사활동 우수 참여",
        points: 5,
        awardedByUserId: admin.id,
        awardedByName: admin.name,
      }),
      txClient,
    );
  });

  it("학년도는 항상 현재 학년도다", async () => {
    findCurrentYearForUpdate.mockResolvedValue(2027);
    await service.awardMerit(
      admin,
      awardInput,
      new Date("2027-08-16T10:00:00+09:00"),
    );

    expect(createAward).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2027 }),
      txClient,
    );
  });

  it("감사로그에 트랙·종류·점수가 남는다", async () => {
    await service.awardMerit(admin, awardInput, NOW);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: admin.id,
        action: "merit:award",
        targetType: "MeritAward",
        targetId: "a-1",
        metadata: expect.objectContaining({
          studentProfileId: "sp-1",
          track: "SCHOOL",
          kind: "MERIT",
          points: 5,
        }),
      }),
      txClient,
    );
  });

  it("부여와 감사로그를 한 트랜잭션에 묶는다", async () => {
    await service.awardMerit(admin, awardInput, NOW);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(findCurrentYearForUpdate).toHaveBeenCalledWith(txClient);
    expect(findRuleForUpdate).toHaveBeenCalledWith("r-1", txClient);
    expect(createAward.mock.calls[0]![1]).toBe(txClient);
    expect(recordAudit.mock.calls[0]![1]).toBe(txClient);
  });

  it("트랜잭션 안에서 이미 삭제된 규정이면 부여도 감사로그도 남기지 않는다", async () => {
    findRuleForUpdate.mockResolvedValue({ ...SCHOOL_RULE, active: false });

    await expect(service.awardMerit(admin, awardInput, NOW)).rejects.toThrow(
      "RULE_INACTIVE",
    );

    expect(findRuleForUpdate).toHaveBeenCalledWith("r-1", txClient);
    expect(createAward).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("비활성 규정으로는 못 준다", async () => {
    findRuleForUpdate.mockResolvedValue({ ...SCHOOL_RULE, active: false });

    await expect(service.awardMerit(admin, awardInput, NOW)).rejects.toThrow(
      "RULE_INACTIVE",
    );
    expect(createAward).not.toHaveBeenCalled();
  });

  it("없는 규정은 RULE_NOT_FOUND", async () => {
    findRuleForUpdate.mockResolvedValue(null);
    await expect(service.awardMerit(admin, awardInput, NOW)).rejects.toThrow(
      "RULE_NOT_FOUND",
    );
  });

  it("없는 학생은 STUDENT_NOT_FOUND", async () => {
    findAwardableStudent.mockResolvedValue(null);
    await expect(service.awardMerit(admin, awardInput, NOW)).rejects.toThrow(
      "STUDENT_NOT_FOUND",
    );
    expect(createAward).not.toHaveBeenCalled();
  });

  it("부여 대상 검사는 잠근 학년도로, 같은 트랜잭션 안에서 한다", async () => {
    await service.awardMerit(admin, awardInput, NOW);

    expect(findAwardableStudent).toHaveBeenCalledWith("sp-1", 2026, txClient);
  });

  it("학생은 상벌점을 줄 수 없다", async () => {
    await expect(service.awardMerit(student, awardInput, NOW)).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(createAward).not.toHaveBeenCalled();
  });

  it("발생일을 그대로 넣는다", async () => {
    await service.awardMerit(admin, awardInput, NOW);

    expect(createAward).toHaveBeenCalledWith(
      expect.objectContaining({ occurredOn: OCCURRED_ON }),
      txClient,
    );
  });

  it("감사로그에 발생일이 남는다", async () => {
    await service.awardMerit(admin, awardInput, NOW);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          occurredOn: OCCURRED_ON.toISOString(),
        }),
      }),
      txClient,
    );
  });
});

describe("발생일 (현재 학년도 2026 = 2026-03-01 ~ 2027-02-28)", () => {
  const cases: [name: string, run: (now: Date) => Promise<unknown>][] = [
    ["단건", (now) => service.awardMerit(admin, awardInput, now)],
    [
      "일괄",
      (now) =>
        service.bulkAwardMerit(
          admin,
          { studentProfileIds: ["sp-1", "sp-2"], ruleId: "r-1", note: null },
          now,
        ),
    ],
  ];

  const writes = () => createAward.mock.calls.length + createAwards.mock.calls.length;

  for (const [name, run] of cases) {
    it(`${name} — 학년도 첫날(3월 1일)에 부여하면 통과한다`, async () => {
      await run(new Date("2026-03-01T09:00:00+09:00"));
      expect(writes()).toBe(1);
    });

    it(`${name} — 학년도 마지막 날(이듬해 2월 28일)도 통과한다`, async () => {
      await run(new Date("2027-02-28T23:00:00+09:00"));
      expect(writes()).toBe(1);
    });

    it(`${name} — 학년도를 안 넘긴 채 3월을 맞으면 거부한다`, async () => {
      await expect(run(new Date("2027-03-02T10:00:00+09:00"))).rejects.toThrow(
        "OCCURRED_OUT_OF_YEAR",
      );
      expect(writes()).toBe(0);
    });

    it(`${name} — 학년도가 시작되기 전이면 거부한다`, async () => {
      await expect(run(new Date("2026-02-28T10:00:00+09:00"))).rejects.toThrow(
        "OCCURRED_OUT_OF_YEAR",
      );
      expect(writes()).toBe(0);
    });

    it(`${name} — 저장되는 발생일은 그날의 KST 자정이다`, async () => {
      await run(new Date("2026-08-16T15:30:00Z"));

      const written =
        createAward.mock.calls[0]?.[0] ?? createAwards.mock.calls[0]?.[0][0];
      expect(written.occurredOn).toEqual(parseDateInputKst("2026-08-17"));
    });
  }

  it("월별 추이 축의 첫 달·마지막 달과 창이 어긋나지 않는다", () => {
    const axis = schoolYearMonths(2026);
    const { start, endExclusive } = schoolYearRange(2026);

    expect(monthKeyKst(start)).toBe(axis[0].key);
    expect(monthKeyKst(new Date(endExclusive.getTime() - 1))).toBe(axis[11].key);
  });
});

function monthKeyKst(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  })
    .format(date)
    .slice(0, 7);
}

describe("cancelAward", () => {
  const cancelInput = { awardId: "a-1", reason: "잘못 입력함" };

  it("취소한 사람과 사유가 기록에 박힌다", async () => {
    await service.cancelAward(admin, cancelInput);

    expect(cancelAward).toHaveBeenCalledWith("a-1", {
      userId: admin.id,
      name: admin.name,
      reason: "잘못 입력함",
    }, txClient);
  });

  it("남이 준 것도 관리자면 취소할 수 있다", async () => {
    await service.cancelAward(other, cancelInput);
    expect(cancelAward).toHaveBeenCalled();
  });

  it("이미 취소된 기록은 다시 취소하지 않는다", async () => {
    findAward.mockResolvedValue({
      id: "a-1",
      studentProfileId: "sp-1",
      track: "SCHOOL",
      kind: "MERIT",
      label: "x",
      points: 5,
      status: "CANCELLED",
      studentProfile: { user: { name: "김민준" } },
    });

    await expect(service.cancelAward(admin, cancelInput)).rejects.toThrow(
      "ALREADY_CANCELLED",
    );
    expect(cancelAward).not.toHaveBeenCalled();
  });

  it("없는 기록은 AWARD_NOT_FOUND", async () => {
    findAward.mockResolvedValue(null);
    await expect(service.cancelAward(admin, cancelInput)).rejects.toThrow(
      "AWARD_NOT_FOUND",
    );
  });

  it("감사로그에 사유가 남는다", async () => {
    await service.cancelAward(admin, cancelInput);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merit:cancel",
        targetType: "MeritAward",
        targetId: "a-1",
        metadata: expect.objectContaining({ reason: "잘못 입력함" }),
      }),
      txClient,
    );
  });

  it("취소와 감사로그를 한 트랜잭션에 묶는다", async () => {
    await service.cancelAward(admin, cancelInput);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(cancelAward.mock.calls[0]![2]).toBe(txClient);
    expect(recordAudit.mock.calls[0]![1]).toBe(txClient);
  });

  it("학생은 취소할 수 없다", async () => {
    await expect(service.cancelAward(student, cancelInput)).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("그 사이 남이 먼저 취소했으면(0행) 실패하고 감사로그를 남기지 않는다", async () => {
    cancelAward.mockResolvedValue(0);

    await expect(service.cancelAward(admin, cancelInput)).rejects.toThrow(
      MeritError,
    );
    await expect(service.cancelAward(admin, cancelInput)).rejects.toThrow(
      "ALREADY_CANCELLED",
    );

    const cancelLogs = recordAudit.mock.calls.filter(
      ([arg]) => arg.action === "merit:cancel",
    );
    expect(cancelLogs).toHaveLength(0);
  });
});

describe("합계 범위 — 이 모듈의 핵심", () => {
  beforeEach(() => {
    totals.mockResolvedValue([
      { kind: "MERIT", _sum: { points: 15 } },
      { kind: "DEMERIT", _sum: { points: 6 } },
    ]);
  });

  it("교내는 그 학년도만 센다", async () => {
    await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    expect(totals).toHaveBeenCalledWith({
      studentProfileId: "sp-1",
      track: "SCHOOL",
      year: 2026,
    });
  });

  it("기숙사는 학년도 조건 없이 전체를 센다", async () => {
    await service.getStudentMerit(admin, "sp-1", "DORM");

    expect(totals).toHaveBeenCalledWith({
      studentProfileId: "sp-1",
      track: "DORM",
      year: null,
    });
  });

  it("교내는 지난 학년도를 골라 볼 수 있다", async () => {
    await service.getStudentMerit(admin, "sp-1", "SCHOOL", 2025);

    expect(totals).toHaveBeenCalledWith({
      studentProfileId: "sp-1",
      track: "SCHOOL",
      year: 2025,
    });
  });

  it("기숙사는 학년도를 넘겨도 무시한다", async () => {
    await service.getStudentMerit(admin, "sp-1", "DORM", 2025);

    expect(totals).toHaveBeenCalledWith({
      studentProfileId: "sp-1",
      track: "DORM",
      year: null,
    });
  });

  it("순점수는 상점 + 상쇄 − 벌점이고 음수가 될 수 있다", async () => {
    totals.mockResolvedValue([
      { kind: "MERIT", _sum: { points: 2 } },
      { kind: "DEMERIT", _sum: { points: 9 } },
    ]);

    const view = await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    expect(view.totals).toEqual({ merit: 2, demerit: 9, offset: 0, net: -7 });
  });

  it("기록이 하나도 없으면 0이다", async () => {
    totals.mockResolvedValue([]);

    const view = await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    expect(view.totals).toEqual({ merit: 0, demerit: 0, offset: 0, net: 0 });
  });
});

describe("getMyMerit", () => {
  it("세션에서 학생 신원을 끌어온다", async () => {
    await service.getMyMerit(student, "SCHOOL");

    expect(findStudentProfileByUserId).toHaveBeenCalledWith(student.id);
    expect(totals).toHaveBeenCalledWith(
      expect.objectContaining({ studentProfileId: "sp-1" }),
    );
  });

  it("학생 신원이 없으면 빈 결과를 준다", async () => {
    findStudentProfileByUserId.mockResolvedValue(null);

    const view = await service.getMyMerit(admin, "SCHOOL");

    expect(view.totals).toEqual({ merit: 0, demerit: 0, offset: 0, net: 0 });
    expect(view.awards).toEqual([]);
  });

  it("두 번째 인자를 학생 id처럼 넘겨도 세션 학생만 조회한다", async () => {
    findStudentProfileByUserId.mockResolvedValue({
      id: "sp-1",
      user: { name: "김민준" },
    });

    await service.getMyMerit(student, "SCHOOL");

    expect(findStudentProfileByUserId).toHaveBeenCalledWith(student.id);
    expect(totals).toHaveBeenCalledWith(
      expect.objectContaining({ studentProfileId: "sp-1", track: "SCHOOL" }),
    );
    for (const [arg] of totals.mock.calls) {
      expect(arg.studentProfileId).toBe("sp-1");
    }
  });
});

describe("getStudentMerit 권한", () => {
  it("학생은 남의 기록을 볼 수 없다", async () => {
    await expect(
      service.getStudentMerit(student, "sp-2", "SCHOOL"),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("bulkAwardMerit", () => {
  const bulk = {
    studentProfileIds: ["sp-1", "sp-2"],
    ruleId: "r-1",
    occurredOn: OCCURRED_ON,
    note: null,
  };

  it("한 번의 쓰기로 넣되 기록끼리 묶지 않는다", async () => {
    await service.bulkAwardMerit(admin, bulk, NOW);

    expect(createAwards).toHaveBeenCalledTimes(1);
    const items = createAwards.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(createAwards.mock.calls[0][1]).toBe(txClient);
    expect(items[0]).not.toHaveProperty("batchId");
    expect(items[1]).not.toHaveProperty("batchId");
  });

  it("감사로그는 학생 수만큼 남는다", async () => {
    await service.bulkAwardMerit(admin, bulk, NOW);

    const meritLogs = recordAudit.mock.calls.filter(
      ([arg]) => arg.action === "merit:award",
    );
    expect(meritLogs).toHaveLength(2);
    expect(meritLogs[0][0].metadata).not.toHaveProperty("batchId");
  });

  it("일괄 부여와 모든 감사로그를 한 트랜잭션에 묶고 timeout을 보존한다", async () => {
    await service.bulkAwardMerit(admin, bulk, NOW);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(withTransaction.mock.calls[0]![1]).toEqual({
      timeout: 30_000,
      maxWait: 5_000,
    });
    expect(findCurrentYearForUpdate).toHaveBeenCalledWith(txClient);
    expect(findRuleForUpdate).toHaveBeenCalledWith("r-1", txClient);
    expect(createAwards.mock.calls[0]![1]).toBe(txClient);
    for (const call of recordAudit.mock.calls) {
      if (call[0].action === "merit:award") expect(call[1]).toBe(txClient);
    }
  });

  it("일괄도 트랜잭션 안에서 삭제된 규정이면 아무 학생에게도 주지 않는다", async () => {
    findRuleForUpdate.mockResolvedValue({ ...SCHOOL_RULE, active: false });

    await expect(service.bulkAwardMerit(admin, bulk, NOW)).rejects.toThrow(
      "RULE_INACTIVE",
    );

    expect(findRuleForUpdate).toHaveBeenCalledWith("r-1", txClient);
    expect(createAwards).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("한 명이라도 없는 학생이면 아무것도 넣지 않는다", async () => {
    findAwardableStudents.mockResolvedValue([
      { id: "sp-1", studentCode: "C", user: { id: "u", name: "n" } },
    ]);

    await expect(service.bulkAwardMerit(admin, bulk, NOW)).rejects.toThrow(
      "STUDENT_NOT_FOUND",
    );
    expect(createAwards).not.toHaveBeenCalled();
  });

  it("학생 조회는 한 번만, 잠근 학년도로 같은 트랜잭션 안에서 한다", async () => {
    await service.bulkAwardMerit(admin, bulk, NOW);

    expect(findAwardableStudents).toHaveBeenCalledTimes(1);
    expect(findAwardableStudents).toHaveBeenCalledWith(["sp-1", "sp-2"], 2026, txClient);
    expect(findAwardableStudent).not.toHaveBeenCalled();
  });

  it("중복 선택은 한 번만 들어간다", async () => {
    await service.bulkAwardMerit(
      admin,
      { ...bulk, studentProfileIds: ["sp-1", "sp-1", "sp-2"] },
      NOW,
    );

    expect(createAwards.mock.calls[0][0]).toHaveLength(2);
  });

  it("비활성 규정으로는 일괄도 못 준다", async () => {
    findRuleForUpdate.mockResolvedValue({ ...SCHOOL_RULE, active: false });

    await expect(service.bulkAwardMerit(admin, bulk, NOW)).rejects.toThrow(
      "RULE_INACTIVE",
    );
    expect(createAwards).not.toHaveBeenCalled();
  });

  it("학생은 일괄 부여를 할 수 없다", async () => {
    await expect(service.bulkAwardMerit(student, bulk, NOW)).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(createAwards).not.toHaveBeenCalled();
  });

  it("돌려주는 건수가 실제로 넣은 수와 같다", async () => {
    const result = await service.bulkAwardMerit(admin, bulk, NOW);
    expect(result).toEqual({ count: 2 });
  });

  describe("인원 상한", () => {
    it("빈 목록이면 조회도 쓰기도 하지 않는다", async () => {
      await expect(
        service.bulkAwardMerit(admin, { ...bulk, studentProfileIds: [] }, NOW),
      ).rejects.toThrow("NO_STUDENTS");

      expect(findAwardableStudents).not.toHaveBeenCalled();
      expect(withTransaction).not.toHaveBeenCalled();
      expect(createAwards).not.toHaveBeenCalled();
    });

    it("상한을 한 명이라도 넘으면 조회 전에 멈춘다", async () => {
      const ids = Array.from({ length: BULK_AWARD_LIMIT + 1 }, (_, i) => `sp-${i}`);

      await expect(
        service.bulkAwardMerit(admin, { ...bulk, studentProfileIds: ids }, NOW),
      ).rejects.toThrow("TOO_MANY_STUDENTS");

      expect(findAwardableStudents).not.toHaveBeenCalled();
      expect(createAwards).not.toHaveBeenCalled();
      expect(recordAudit).not.toHaveBeenCalled();
    });

    it("중복은 상한에 세지 않는다", async () => {
      const ids = Array.from({ length: BULK_AWARD_LIMIT }, (_, i) => `sp-${i}`);

      await expect(
        service.bulkAwardMerit(admin, { ...bulk, studentProfileIds: [...ids, "sp-0"] }, NOW),
      ).resolves.toBeDefined();

      expect(findAwardableStudents).toHaveBeenCalledWith(ids, 2026, txClient);
    });

    it("상한 정확히면 통과한다", async () => {
      const ids = Array.from({ length: BULK_AWARD_LIMIT }, (_, i) => `sp-${i}`);

      await expect(
        service.bulkAwardMerit(admin, { ...bulk, studentProfileIds: ids }, NOW),
      ).resolves.toBeDefined();

      expect(createAwards.mock.calls[0][0]).toHaveLength(BULK_AWARD_LIMIT);
    });

    it("둘 다 MeritError다 — 액션의 MESSAGES가 문구로 옮긴다", async () => {
      await expect(
        service.bulkAwardMerit(admin, { ...bulk, studentProfileIds: [] }, NOW),
      ).rejects.toBeInstanceOf(MeritError);
      await expect(
        service.bulkAwardMerit(
          admin,
          {
            ...bulk,
            studentProfileIds: Array.from(
              { length: BULK_AWARD_LIMIT + 1 },
              (_, i) => `sp-${i}`,
            ),
          },
          NOW,
        ),
      ).rejects.toBeInstanceOf(MeritError);
    });
  });
});

describe("getClassRoster", () => {
  it("교내는 그 학년도 합계로 반 명단을 만든다", async () => {
    await service.getClassRoster(admin, {
      grade: 2,
      classNo: 3,
      track: "SCHOOL",
    });

    expect(listClassRoster).toHaveBeenCalledWith({
      year: 2026,
      grade: 2,
      classNo: 3,
      track: "SCHOOL",
      totalsYear: 2026,
    });
  });

  it("기숙사는 합계만 누적으로 센다", async () => {
    await service.getClassRoster(admin, {
      grade: 2,
      classNo: 3,
      track: "DORM",
    });

    expect(listClassRoster).toHaveBeenCalledWith({
      year: 2026,
      grade: 2,
      classNo: 3,
      track: "DORM",
      totalsYear: null,
    });
  });

  it("학생은 반 명단을 볼 수 없다", async () => {
    await expect(
      service.getClassRoster(student, { grade: 1, classNo: 1, track: "SCHOOL" }),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("listRecentAwards", () => {
  const ROWS = [
    { id: "a-1", kind: "MERIT", status: "ACTIVE" },
    { id: "a-2", kind: "DEMERIT", status: "CANCELLED" },
  ];

  it("필터를 넘기고 한 페이지를 20건씩 가져온다", async () => {
    await service.listRecentAwards(admin, {
      track: "DORM",
      kind: "DEMERIT",
      status: "ACTIVE",
      q: "점호",
      page: 3,
    });

    expect(findRecentAwardPage).toHaveBeenCalledWith(
      {
        track: "DORM",
        kind: "DEMERIT",
        status: "ACTIVE",
        q: "점호",
      },
      40,
      20,
    );
  });

  it("취소된 기록도 그대로 넘기고 총 건수로 페이지 수를 계산한다", async () => {
    findRecentAwardPage.mockResolvedValue(ROWS);
    countRecentAwards.mockResolvedValue(41);

    expect(
      await service.listRecentAwards(admin, { track: "SCHOOL", page: 2 }),
    ).toEqual({ entries: ROWS, total: 41, page: 2, pageCount: 3 });
  });

  it("학생은 볼 수 없다", async () => {
    await expect(
      service.listRecentAwards(student, { track: "SCHOOL", page: 1 }),
    ).rejects.toThrow("FORBIDDEN");
    expect(findRecentAwardPage).not.toHaveBeenCalled();
  });

  it("학부모도 볼 수 없다", async () => {
    await expect(
      service.listRecentAwards(user("PARENT", "p-1", { name: "이정민" }), {
        track: "SCHOOL",
        page: 1,
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(findRecentAwardPage).not.toHaveBeenCalled();
  });

  it("내보내기는 페이지와 무관하게 같은 필터 전체를 가져온다", async () => {
    const result = await service.exportRecentAwards(admin, {
      track: "SCHOOL",
      kind: "MERIT",
      status: "ACTIVE",
      q: "봉사",
    });

    expect(findRecentAwardsForExport).toHaveBeenCalledWith({
      track: "SCHOOL",
      kind: "MERIT",
      status: "ACTIVE",
      q: "봉사",
    });
    expect(result.filename).toBe("교내_최근부여.xlsx");
    expect(result.rows[0][0]).toContain("검색: 봉사");
  });
});

describe("searchStudents", () => {
  function found(over: Record<string, unknown> = {}) {
    return {
      id: "sp-1",
      studentCode: "K7M2XQ4A",
      user: { name: "김민준" },
      enrollments: [
        { grade: 2, classNo: 3, number: 7, status: "ENROLLED" },
      ],
      ...over,
    };
  }

  it("재학생은 소속과 학적을 함께 낸다", async () => {
    searchStudents.mockResolvedValue([found()]);

    expect(await service.searchStudents(admin, "김민준")).toEqual([
      {
        studentProfileId: "sp-1",
        studentCode: "K7M2XQ4A",
        name: "김민준",
        grade: 2,
        classNo: 3,
        number: 7,
        status: "ENROLLED",
        removed: false,
      },
    ]);
  });

  it("졸업생도 검색에 잡히고 학적이 함께 온다", async () => {
    searchStudents.mockResolvedValue([
      found({
        enrollments: [
          { grade: 3, classNo: 1, number: 7, status: "GRADUATED" },
        ],
      }),
    ]);

    const [row] = await service.searchStudents(admin, "김민준");
    expect(row.status).toBe("GRADUATED");
  });

  it("재학이 아니면 반·번호는 비운다", async () => {
    searchStudents.mockResolvedValue([
      found({
        enrollments: [
          { grade: 3, classNo: 1, number: 7, status: "WITHDRAWN" },
        ],
      }),
    ]);

    const [row] = await service.searchStudents(admin, "김민준");
    expect(row).toEqual(
      expect.objectContaining({ grade: null, classNo: null, number: null }),
    );
  });

  it("그 학년도 재적 줄이 아예 없으면 학적은 null이다", async () => {
    searchStudents.mockResolvedValue([found({ enrollments: [] })]);

    const [row] = await service.searchStudents(admin, "김민준");
    expect(row.status).toBeNull();
    expect(row.grade).toBeNull();
  });

  it("현재 학년도 기준으로 찾는다", async () => {
    await service.searchStudents(admin, "  김민준  ");

    expect(searchStudents).toHaveBeenCalledWith("김민준", 2026, {
      includeRemoved: false,
    });
  });

  describe("학번(4자리) 검색", () => {
    it("2305를 2학년 3반 5번으로 읽어 넘긴다", async () => {
      await service.searchStudents(admin, "2305");

      expect(searchStudents).toHaveBeenCalledWith("2305", 2026, {
        includeRemoved: false,
        studentNumber: { grade: 2, classNo: 3, number: 5 },
      });
    });

    it("앞뒤 공백을 떼고 읽는다 — 잘라낸 값이 곧 검색어다", async () => {
      await service.searchStudents(admin, "  1102  ");

      expect(searchStudents).toHaveBeenCalledWith("1102", 2026, {
        includeRemoved: false,
        studentNumber: { grade: 1, classNo: 1, number: 2 },
      });
    });

    it("학번이 아니면 넘기지 않는다 — 이름·학생코드만 본다", async () => {
      await service.searchStudents(admin, "김민준");

      expect(searchStudents.mock.calls[0][2].studentNumber).toBeUndefined();
    });

    it("0이 낀 4자리는 학번이 아니다", async () => {
      await service.searchStudents(admin, "2005");

      expect(searchStudents.mock.calls[0][2].studentNumber).toBeUndefined();
    });

    it("빠진 학생을 함께 볼 때도 학번을 넘긴다", async () => {
      await service.searchStudents(admin, "2305", { includeRemoved: true });

      expect(searchStudents).toHaveBeenCalledWith("2305", 2026, {
        includeRemoved: true,
        studentNumber: { grade: 2, classNo: 3, number: 5 },
      });
    });
  });

  it("빈 검색어는 조회하지 않는다", async () => {
    expect(await service.searchStudents(admin, "   ")).toEqual([]);
    expect(searchStudents).not.toHaveBeenCalled();
  });

  it("학생은 남을 검색할 수 없다", async () => {
    await expect(service.searchStudents(student, "김")).rejects.toThrow("FORBIDDEN");
    expect(searchStudents).not.toHaveBeenCalled();
  });

  describe("명단에서 빠진 학생 (감사 M-2)", () => {
    it("기본은 옵트인하지 않은 것으로 넘긴다", async () => {
      await service.searchStudents(admin, "김민준");

      expect(searchStudents).toHaveBeenCalledWith("김민준", 2026, {
        includeRemoved: false,
      });
    });

    it("요청하면 그대로 넘긴다", async () => {
      await service.searchStudents(admin, "김민준", { includeRemoved: true });

      expect(searchStudents).toHaveBeenCalledWith("김민준", 2026, {
        includeRemoved: true,
      });
    });

    it("재적이 아니면 removed가 true다", async () => {
      searchStudents.mockResolvedValue([
        found({
          enrollments: [
            { grade: null, classNo: null, number: null, status: "GRADUATED" },
          ],
        }),
      ]);

      const [row] = await service.searchStudents(admin, "김민준", {
        includeRemoved: true,
      });

      expect(row.removed).toBe(true);
      expect(row.grade).toBeNull();
      expect(row.status).toBe("GRADUATED");
    });

    it("그 학년도 재적 줄이 아예 없어도 removed다", async () => {
      searchStudents.mockResolvedValue([found({ enrollments: [] })]);

      const [row] = await service.searchStudents(admin, "김민준", {
        includeRemoved: true,
      });

      expect(row.removed).toBe(true);
      expect(row.status).toBeNull();
    });

    it("관리자만 볼 수 있다", async () => {
      await expect(
        service.searchStudents(student, "김", { includeRemoved: true }),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        service.searchStudents(user("PARENT", "p-1", { name: "이정민" }), "김", {
          includeRemoved: true,
        }),
      ).rejects.toThrow("FORBIDDEN");
      expect(searchStudents).not.toHaveBeenCalled();
    });
  });
});

describe("getStudentHeader", () => {
  it("관리자만 볼 수 있다", async () => {
    await expect(service.getStudentHeader(student, "sp-1")).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(
      service.getStudentHeader(user("PARENT", "p-1", { name: "이정민" }), "sp-1"),
    ).rejects.toThrow("FORBIDDEN");
    expect(findStudentHeader).not.toHaveBeenCalled();
  });

  it("현재 학년도 기준으로 소속을 낸다", async () => {
    expect(await service.getStudentHeader(admin, "sp-1")).toEqual(HEADER);
    expect(findStudentHeader).toHaveBeenCalledWith("sp-1", 2026);
  });

  it("명단에서 빠진 학생도 removed와 함께 돌아온다", async () => {
    findStudentHeader.mockResolvedValue({
      ...HEADER,
      status: "TRANSFERRED",
      removed: true,
    });

    const header = await service.getStudentHeader(admin, "sp-1");

    expect(header?.removed).toBe(true);
    expect(header?.status).toBe("TRANSFERRED");
  });
});

describe("listAwardYears", () => {
  it("관리자는 아무 학생의 학년도 선택지를 볼 수 있다", async () => {
    expect(await service.listAwardYears(admin, "sp-9")).toEqual([2026, 2025]);
    expect(listAwardYears).toHaveBeenCalledWith("sp-9");
  });

  it("학생은 남의 학년도 선택지를 볼 수 없다", async () => {
    await expect(service.listAwardYears(student, "sp-2")).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(listAwardYears).not.toHaveBeenCalled();
  });

  it("학부모도 이 경로로는 볼 수 없다", async () => {
    await expect(
      service.listAwardYears(user("PARENT", "p-1", { name: "이정민" }), "sp-1"),
    ).rejects.toThrow("FORBIDDEN");
    expect(listAwardYears).not.toHaveBeenCalled();
  });
});

describe("listMyAwardYears", () => {
  it("세션에서 학생 신원을 끌어온다", async () => {
    await service.listMyAwardYears(student);

    expect(findStudentProfileByUserId).toHaveBeenCalledWith(student.id);
    expect(listAwardYears).toHaveBeenCalledWith("sp-1");
  });

  it("학생 신원이 없으면 빈 목록이다", async () => {
    findStudentProfileByUserId.mockResolvedValue(null);

    expect(await service.listMyAwardYears(admin)).toEqual([]);
    expect(listAwardYears).not.toHaveBeenCalled();
  });
});

describe("listChildAwardYears", () => {
  const parent = user("PARENT", "p-1", { name: "이정민" });

  it("연결된 자녀의 학년도 선택지는 볼 수 있다", async () => {
    isChildOf.mockResolvedValue(true);

    expect(await service.listChildAwardYears(parent, "sp-1")).toEqual([2026, 2025]);
    expect(isChildOf).toHaveBeenCalledWith("p-1", "sp-1");
  });

  it("연결되지 않은 학생은 못 본다", async () => {
    isChildOf.mockResolvedValue(false);

    await expect(service.listChildAwardYears(parent, "sp-9")).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(listAwardYears).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "authz:denied" }),
    );
  });
});

describe("학부모 조회", () => {
  const parent = user("PARENT", "p-1", { name: "이정민" });

  it("연결된 자녀는 볼 수 있다", async () => {
    isChildOf.mockResolvedValue(true);

    await service.getChildMerit(parent, "sp-1", "SCHOOL");

    expect(isChildOf).toHaveBeenCalledWith("p-1", "sp-1");
    expect(totals).toHaveBeenCalled();
  });

  it("연결되지 않은 학생은 못 본다", async () => {
    isChildOf.mockResolvedValue(false);

    await expect(
      service.getChildMerit(parent, "sp-9", "SCHOOL"),
    ).rejects.toThrow("FORBIDDEN");

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "authz:denied" }),
    );
    expect(totals).not.toHaveBeenCalled();
  });

  it("학생이 남의 자녀 경로로 우회할 수 없다", async () => {
    isChildOf.mockResolvedValue(false);

    await expect(
      service.getChildMerit(student, "sp-2", "SCHOOL"),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("exportClassRoster", () => {
  const ROSTER = [
    {
      studentProfileId: "sp-1",
      studentCode: "K7M2XQ4A",
      name: "김민준",
      number: 3,
      merit: 15,
      demerit: 6,
      offset: 0,
      net: 9,
    },
  ];

  it("반 명단을 시트로 만들고 파일명까지 낸다", async () => {
    listClassRoster.mockResolvedValue(ROSTER);

    const result = await service.exportClassRoster(admin, {
      grade: 2,
      classNo: 3,
      track: "SCHOOL",
      year: 2026,
    });

    expect(result.filename).toBe("2026_2학년3반_교내상벌점.xlsx");
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual(["2026학년도 2학년 3반 · 교내"]);
  });

  it("학년도를 안 주면 현재 학년도로 채운다", async () => {
    const result = await service.exportClassRoster(admin, {
      grade: 1,
      classNo: 1,
      track: "SCHOOL",
    });

    expect(getCurrentYear).toHaveBeenCalled();
    expect(result.filename).toBe("2026_1학년1반_교내상벌점.xlsx");
  });

  it("기숙사는 합계를 누적으로 센다", async () => {
    await service.exportClassRoster(admin, { grade: 2, classNo: 3, track: "DORM" });

    expect(listClassRoster).toHaveBeenCalledWith(
      expect.objectContaining({ track: "DORM", totalsYear: null }),
    );
  });

  it("null을 내보내지 않는다", async () => {
    listClassRoster.mockResolvedValue([{ ...ROSTER[0], number: null }]);

    const result = await service.exportClassRoster(admin, {
      grade: 2,
      classNo: 3,
      track: "SCHOOL",
    });

    expect(result.rows[2]?.[0]).toBe("");
    for (const row of result.rows) expect(row).not.toContain(null);
  });

  it("학생은 반 명단을 내려받을 수 없다", async () => {
    await expect(
      service.exportClassRoster(student, { grade: 1, classNo: 1, track: "SCHOOL" }),
    ).rejects.toThrow("FORBIDDEN");

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "authz:denied" }),
    );
    expect(listClassRoster).not.toHaveBeenCalled();
  });

  it("학부모도 내려받을 수 없다", async () => {
    await expect(
      service.exportClassRoster(
        { ...student, id: "p-1", role: "PARENT" },
        { grade: 1, classNo: 1, track: "SCHOOL" },
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("exportStudentHistory", () => {
  const AWARD = {
    id: "a-1",
    year: 2026,
    kind: "DEMERIT",
    label: "점호 지각",
    points: 3,
    note: null,
    awardedByName: "이정민",
    status: "ACTIVE",
    cancelReason: null,
    occurredOn: new Date("2026-06-12T00:00:00+09:00"),
    createdAt: new Date("2026-08-16T00:00:00+09:00"),
  };

  it("학생 이름으로 시트와 파일명을 만든다", async () => {
    listAwards.mockResolvedValue([AWARD]);

    const result = await service.exportStudentHistory(admin, {
      studentProfileId: "sp-1",
      track: "SCHOOL",
      year: 2026,
    });

    expect(result.filename).toBe("김민준_교내상벌점_2026.xlsx");
    expect(result.rows[0]).toEqual(["김민준 · 교내 상벌점"]);
    expect(result.rows).toHaveLength(3);
  });

  it("기숙사는 누적이라 파일명에 학년도를 적지 않는다", async () => {
    const result = await service.exportStudentHistory(admin, {
      studentProfileId: "sp-1",
      track: "DORM",
    });

    expect(result.filename).toBe("김민준_기숙사상벌점_누적.xlsx");
  });

  it("없는 학생이면 빈 파일을 만들지 않고 던진다", async () => {
    findStudentHeader.mockResolvedValue(null);

    await expect(
      service.exportStudentHistory(admin, {
        studentProfileId: "sp-x",
        track: "SCHOOL",
      }),
    ).rejects.toThrow(MeritError);
  });

  it("명단에서 빠진 학생도 내려받을 수 있다", async () => {
    findStudentHeader.mockResolvedValue({
      ...HEADER,
      status: "GRADUATED",
      removed: true,
    });

    const result = await service.exportStudentHistory(admin, {
      studentProfileId: "sp-1",
      track: "SCHOOL",
    });

    expect(result.filename).toContain("김민준");
  });

  it("학생은 남의 내역을 내려받을 수 없다", async () => {
    await expect(
      service.exportStudentHistory(student, {
        studentProfileId: "sp-2",
        track: "SCHOOL",
      }),
    ).rejects.toThrow("FORBIDDEN");

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "authz:denied" }),
    );
    expect(listAwards).not.toHaveBeenCalled();
  });

  it("학부모도 자녀 경로가 아닌 이 함수로는 못 온다", async () => {
    await expect(
      service.exportStudentHistory(
        { ...student, id: "p-1", role: "PARENT" },
        { studentProfileId: "sp-1", track: "SCHOOL" },
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("listMyChildren() — 세션에서만 유도한다", () => {
  const parent = user("PARENT", "p-1", { name: "이정민" });

  it("두 번째 인자로 남의 학부모 id를 넣어도 세션 계정만 조회한다", async () => {
    listChildren.mockResolvedValue([]);

    await (service.listMyChildren as (...args: unknown[]) => Promise<unknown>)(
      parent,
      "u-남의학부모",
    );

    expect(listChildren).toHaveBeenCalledWith(parent.id);
    expect(listChildren).not.toHaveBeenCalledWith("u-남의학부모");
  });
});

describe("발생일은 부여 시각에서 유도된다", () => {
  it("입력에 발생일을 넣어도 무시되고 오늘(KST 자정)이 들어간다", async () => {
    await service.awardMerit(
      admin,
      { ...awardInput, occurredOn: "2099-01-01" } as typeof awardInput,
      NOW,
    );

    const written = createAward.mock.calls[0]![0];
    expect(written.occurredOn).toEqual(OCCURRED_ON);
    expect(written.occurredOn.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });
});
