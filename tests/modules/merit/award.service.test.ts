import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { parseDateInputKst } from "@/lib/datetime";
import { schoolYearMonths, schoolYearRange } from "@/modules/merit/merit.chart";

const findRule = vi.fn();
const createAward = vi.fn();
const findAward = vi.fn();
const cancelAward = vi.fn();
const listAwards = vi.fn();
const totals = vi.fn();
const findStudentProfileByUserId = vi.fn();
const findStudentProfileById = vi.fn();
const findStudentProfilesByIds = vi.fn();
const recordAudit = vi.fn();
const getCurrentYear = vi.fn();
const createAwards = vi.fn();
const listClassRoster = vi.fn();
const searchStudents = vi.fn();
const listChildren = vi.fn();
const isChildOf = vi.fn();
const findBatch = vi.fn();
const cancelAwards = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  findRule,
  createAward,
  findAward,
  cancelAward,
  listAwards,
  totals,
  findStudentProfileByUserId,
  findStudentProfileById,
  findStudentProfilesByIds,
  createAwards,
  listClassRoster,
  searchStudents,
  listChildren,
  isChildOf,
  findBatch,
  cancelAwards,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear,
  AcademicYearError: class extends Error {},
}));

const { MeritError } = await import("@/modules/merit/merit.error");
const service = await import("@/modules/merit/award.service");

function user(role: SessionUser["role"], id = "admin-1"): SessionUser {
  return {
    id,
    name: "이정민",
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const admin = user("ADMIN");
const other = user("ADMIN", "admin-2");
const student = user("STUDENT", "u-1");

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
  findRule.mockReset().mockResolvedValue(SCHOOL_RULE);
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
  // 고친 행 수를 돌려준다. 1 = 내가 취소했다, 0 = 그 사이 남이 먼저 취소했다.
  cancelAward.mockReset().mockResolvedValue(1);
  listAwards.mockReset().mockResolvedValue([]);
  totals.mockReset().mockResolvedValue([]);
  findStudentProfileByUserId.mockReset().mockResolvedValue({
    id: "sp-1",
    user: { name: "김민준" },
  });
  findStudentProfileById.mockReset().mockResolvedValue({
    id: "sp-1",
    studentCode: "K7M2XQ4A",
    user: { id: "u-1", name: "김민준" },
  });
  // 일괄 부여는 한 번에 조회한다 — 넘긴 id 전부를 찾은 것으로 기본 설정한다.
  findStudentProfilesByIds
    .mockReset()
    .mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({ id, studentCode: "CODE", user: { id: `u-${id}`, name: `학생${id}` } })),
    );
  recordAudit.mockReset().mockResolvedValue(undefined);
  createAwards.mockReset().mockResolvedValue([{ id: "a-1" }, { id: "a-2" }]);
  listClassRoster.mockReset().mockResolvedValue([]);
  searchStudents.mockReset().mockResolvedValue([]);
  listChildren.mockReset().mockResolvedValue([]);
  isChildOf.mockReset().mockResolvedValue(true);
  findBatch.mockReset().mockResolvedValue(BATCH_AWARDS);
  // 실제로 취소된 것의 id만 돌려준다 — 기본은 넘긴 것 전부가 취소된 경우다.
  cancelAwards.mockReset().mockImplementation(async (ids: string[]) => ids);
});

/** 한 묶음에 속한 살아 있는 기록 셋. 학생이 서로 다르다는 것이 요점이다. */
const BATCH_AWARDS = [
  {
    id: "a-1",
    studentProfileId: "sp-1",
    track: "DORM",
    kind: "DEMERIT",
    label: "점호 지각",
    points: 3,
    studentProfile: { user: { name: "김민준" } },
  },
  {
    id: "a-2",
    studentProfileId: "sp-2",
    track: "DORM",
    kind: "DEMERIT",
    label: "점호 지각",
    points: 3,
    studentProfile: { user: { name: "이서연" } },
  },
  {
    id: "a-3",
    studentProfileId: "sp-3",
    track: "DORM",
    kind: "DEMERIT",
    label: "점호 지각",
    points: 3,
    studentProfile: { user: { name: "박도윤" } },
  },
];

/**
 * 발생일은 2026학년도(2026-03-01 ~ 2027-02-28) 안이고 NOW보다 앞이다.
 * 기준 시각을 인자로 넘기는 이유는 오늘 날짜가 바뀌어도 테스트가 안 흔들리게 하기 위해서다.
 */
const NOW = new Date("2026-08-16T10:00:00+09:00");
const OCCURRED_ON = parseDateInputKst("2026-06-12");

const awardInput = {
  studentProfileId: "sp-1",
  ruleId: "r-1",
  occurredOn: OCCURRED_ON,
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
        batchId: null,
      }),
    );
  });

  it("학년도는 항상 현재 학년도다 — 입력으로 받지 않는다", async () => {
    getCurrentYear.mockResolvedValue(2027);
    // 발생일 검사는 그 학년도 창을 보므로 함께 옮겨 준다 (검사 자체는 아래에서 따로 본다).
    await service.awardMerit(
      admin,
      { ...awardInput, occurredOn: parseDateInputKst("2027-06-12") },
      new Date("2027-08-16T10:00:00+09:00"),
    );

    expect(createAward).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2027 }),
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
    );
  });

  it("비활성 규정으로는 못 준다", async () => {
    findRule.mockResolvedValue({ ...SCHOOL_RULE, active: false });

    await expect(service.awardMerit(admin, awardInput, NOW)).rejects.toThrow(
      "RULE_INACTIVE",
    );
    expect(createAward).not.toHaveBeenCalled();
  });

  it("없는 규정은 RULE_NOT_FOUND", async () => {
    findRule.mockResolvedValue(null);
    await expect(service.awardMerit(admin, awardInput, NOW)).rejects.toThrow(
      "RULE_NOT_FOUND",
    );
  });

  it("없는 학생은 STUDENT_NOT_FOUND — 소프트 삭제된 학생도 여기 걸린다", async () => {
    findStudentProfileById.mockResolvedValue(null);
    await expect(service.awardMerit(admin, awardInput, NOW)).rejects.toThrow(
      "STUDENT_NOT_FOUND",
    );
    expect(createAward).not.toHaveBeenCalled();
  });

  it("학생은 상벌점을 줄 수 없다", async () => {
    await expect(service.awardMerit(student, awardInput, NOW)).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(createAward).not.toHaveBeenCalled();
  });

  it("발생일을 그대로 넣는다 — 입력 시각(createdAt)과 별개다", async () => {
    await service.awardMerit(admin, awardInput, NOW);

    expect(createAward).toHaveBeenCalledWith(
      expect.objectContaining({ occurredOn: OCCURRED_ON }),
    );
  });

  it("감사로그에 발생일이 남는다 — 로그 자체의 시각은 '언제 입력됐나'다", async () => {
    await service.awardMerit(admin, awardInput, NOW);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          occurredOn: OCCURRED_ON.toISOString(),
        }),
      }),
    );
  });
});

/**
 * 발생일 검사.
 *
 * **조용히 틀리는 것을 막는 장치다.** 부여는 언제나 현재 학년도로 들어가는데
 * 월별 추이 축은 그 학년도의 12칸(3월~이듬해 2월)이고, monthlyTotals는 축 밖의
 * 기록을 말없이 버린다 — 검사가 없으면 "부여했습니다"가 뜬 기록이 어느 화면에도
 * 안 나타나는 상태가 만들어진다.
 *
 * 두 부여 경로(단건·일괄)에 같은 규칙이 걸리는지 함께 본다. 한쪽만 막으면
 * 반별 목록에서 준 벌점만 그래프에서 사라진다.
 */
describe("발생일 검사 (현재 학년도 2026 = 2026-03-01 ~ 2027-02-28)", () => {
  const cases: [name: string, run: (occurredOn: Date, now?: Date) => Promise<unknown>][] = [
    ["단건", (occurredOn, now = NOW) => service.awardMerit(admin, { ...awardInput, occurredOn }, now)],
    [
      "일괄",
      (occurredOn, now = NOW) =>
        service.bulkAwardMerit(
          admin,
          // createAwards 목이 2건을 돌려주므로 대상도 2명이어야 짝이 맞는다.
          { studentProfileIds: ["sp-1", "sp-2"], ruleId: "r-1", occurredOn, note: null },
          now,
        ),
    ],
  ];

  /** 두 경로를 한 줄로 세는 헬퍼 — 어느 쪽이 돌았든 "썼는가"만 본다. */
  const writes = () => createAward.mock.calls.length + createAwards.mock.calls.length;

  for (const [name, run] of cases) {
    it(`${name} — 학년도 첫날(3월 1일)은 통과한다`, async () => {
      await run(parseDateInputKst("2026-03-01"));
      expect(writes()).toBe(1);
    });

    it(`${name} — 학년도 마지막 날(이듬해 2월 28일)도 통과한다`, async () => {
      // 그 시점에서는 미래가 아니어야 하므로 기준 시각을 함께 옮긴다.
      await run(parseDateInputKst("2027-02-28"), new Date("2027-02-28T23:00:00+09:00"));
      expect(writes()).toBe(1);
    });

    it(`${name} — 학년도 시작 하루 전(2월 28일)은 거부한다`, async () => {
      await expect(run(parseDateInputKst("2026-02-28"))).rejects.toThrow(
        "OCCURRED_OUT_OF_YEAR",
      );
      expect(writes()).toBe(0);
    });

    it(`${name} — 학년도가 끝난 다음 날(3월 1일)은 거부한다`, async () => {
      await expect(
        run(parseDateInputKst("2027-03-01"), new Date("2027-03-02T10:00:00+09:00")),
      ).rejects.toThrow("OCCURRED_OUT_OF_YEAR");
    });

    it(`${name} — 학년도 안이어도 미래면 거부한다`, async () => {
      // 8월에 다음 1월을 고르면 학년도 창 안이다 — 창만으로는 못 거른다.
      await expect(run(parseDateInputKst("2027-01-15"))).rejects.toThrow(
        "OCCURRED_IN_FUTURE",
      );
      expect(writes()).toBe(0);
    });

    it(`${name} — 오늘은 통과한다 (기본값이 오늘이다)`, async () => {
      await run(parseDateInputKst("2026-08-16"));
      expect(writes()).toBe(1);
    });
  }

  it("월별 추이 축의 첫 달·마지막 달과 창이 어긋나지 않는다", () => {
    // 이 두 값이 갈리는 순간, 검사를 통과한 기록이 그래프에서 조용히 사라진다.
    const axis = schoolYearMonths(2026);
    const { start, endExclusive } = schoolYearRange(2026);

    expect(monthKeyKst(start)).toBe(axis[0].key);
    expect(monthKeyKst(new Date(endExclusive.getTime() - 1))).toBe(axis[11].key);
  });
});

/** KST 기준 `YYYY-MM` — 축의 key와 같은 모양. */
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
    });
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
    );
  });

  it("학생은 취소할 수 없다", async () => {
    await expect(service.cancelAward(student, cancelInput)).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  /**
   * 사전 검사(findAward)와 갱신 사이는 원자적이지 않다. 두 관리자가 같은 기록의
   * 취소를 동시에 누르면 둘 다 검사를 통과하고, repo가 ACTIVE인 행만 고치므로
   * 나중 사람은 0을 받는다. 그때 감사로그까지 남기면 "두 사람이 취소했다"는
   * 거짓 기록이 생긴다.
   */
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

/**
 * 묶음 취소.
 *
 * 사감이 28명에게 일괄 부여한 뒤 되돌리는 경로다. **감사로그가 유일한 근거**이므로
 * ("관리자면 누구나 취소할 수 있다"는 결정이 여기 기대고 있다) 두 가지가 성립해야 한다 —
 * 줄마다 누구 기록인지 알 수 있어야 하고, 실제로 취소된 것에만 남아야 한다.
 */
describe("cancelBatch", () => {
  const batchInput = { batchId: "batch-1", reason: "항목을 잘못 골랐음" };

  it("취소한 사람과 사유가 기록에 박힌다", async () => {
    await service.cancelBatch(admin, batchInput);

    expect(cancelAwards).toHaveBeenCalledWith(["a-1", "a-2", "a-3"], {
      userId: admin.id,
      name: admin.name,
      reason: "항목을 잘못 골랐음",
    });
  });

  it("돌려주는 건수가 실제로 취소된 수다", async () => {
    expect(await service.cancelBatch(admin, batchInput)).toEqual({ count: 3 });
  });

  it("없는 묶음은 BATCH_NOT_FOUND — 아무것도 고치지 않는다", async () => {
    findBatch.mockResolvedValue([]);

    await expect(service.cancelBatch(admin, batchInput)).rejects.toThrow(
      "BATCH_NOT_FOUND",
    );
    expect(cancelAwards).not.toHaveBeenCalled();
  });

  it("학생은 묶음을 취소할 수 없다", async () => {
    await expect(service.cancelBatch(student, batchInput)).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(cancelAwards).not.toHaveBeenCalled();
  });

  it("감사로그는 건별 1줄이다", async () => {
    await service.cancelBatch(admin, batchInput);

    expect(cancelLogs()).toHaveLength(3);
  });

  /**
   * 28줄이 전부 `기숙사 · 벌점 3점 · 점호 지각`으로 똑같으면 누구 기록이 뒤집혔는지
   * 로그만 보고는 알 수 없다. 단건 취소는 정확히 이 이유로 이름을 남긴다.
   */
  it("줄마다 학생 이름이 남는다 — 묶음이면 나머지 값이 전부 같다", async () => {
    await service.cancelBatch(admin, batchInput);

    expect(cancelLogs().map((log) => log.metadata.studentName)).toEqual([
      "김민준",
      "이서연",
      "박도윤",
    ]);
  });

  it("줄마다 그 학생의 id·묶음·사유가 남는다", async () => {
    await service.cancelBatch(admin, batchInput);

    expect(cancelLogs()[1]).toEqual(
      expect.objectContaining({
        actorUserId: admin.id,
        action: "merit:cancel",
        targetType: "MeritAward",
        targetId: "a-2",
        metadata: expect.objectContaining({
          studentProfileId: "sp-2",
          studentName: "이서연",
          track: "DORM",
          kind: "DEMERIT",
          label: "점호 지각",
          points: 3,
          reason: "항목을 잘못 골랐음",
          batchId: "batch-1",
        }),
      }),
    );
  });

  /**
   * 사전 조회와 갱신 사이에 누가 몇 건을 단건으로 취소할 수 있다. 그때 조회한
   * 건수로 로그를 남기면 "내가 취소했다"가 거짓인 줄이 섞인다 — 단건 경로는
   * `cancelled === 0` 검사로 정확히 이걸 막는다.
   */
  it("그 사이 남이 먼저 취소한 건에는 로그를 남기지 않는다", async () => {
    // 조회는 3건인데 실제로는 2건만 뒤집혔다 (a-2는 남이 먼저 취소).
    cancelAwards.mockResolvedValue(["a-1", "a-3"]);

    const result = await service.cancelBatch(admin, batchInput);

    expect(result).toEqual({ count: 2 });
    expect(cancelLogs().map((log) => log.targetId)).toEqual(["a-1", "a-3"]);
    expect(cancelLogs().map((log) => log.metadata.studentName)).toEqual([
      "김민준",
      "박도윤",
    ]);
  });

  it("그 사이 전부 취소됐으면 실패하고 감사로그를 남기지 않는다", async () => {
    cancelAwards.mockResolvedValue([]);

    await expect(service.cancelBatch(admin, batchInput)).rejects.toThrow(
      MeritError,
    );
    await expect(service.cancelBatch(admin, batchInput)).rejects.toThrow(
      "ALREADY_CANCELLED",
    );

    expect(cancelLogs()).toHaveLength(0);
  });

  it("남이 준 묶음도 관리자면 취소할 수 있다", async () => {
    await service.cancelBatch(other, batchInput);
    expect(cancelAwards).toHaveBeenCalled();
  });
});

/** 취소 감사로그만 골라낸다. */
function cancelLogs() {
  return recordAudit.mock.calls
    .map(([arg]) => arg)
    .filter((arg) => arg.action === "merit:cancel");
}

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

  it("기숙사는 학년도를 넘겨도 무시한다 — 누적이라 고를 것이 없다", async () => {
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
  it("세션에서 학생 신원을 끌어온다 — studentProfileId를 인자로 받지 않는다", async () => {
    await service.getMyMerit(student, "SCHOOL");

    expect(findStudentProfileByUserId).toHaveBeenCalledWith(student.id);
    expect(totals).toHaveBeenCalledWith(
      expect.objectContaining({ studentProfileId: "sp-1" }),
    );
  });

  it("학생 신원이 없으면 빈 결과를 준다 — 관리자가 자기 화면을 열어도 안 터진다", async () => {
    findStudentProfileByUserId.mockResolvedValue(null);

    const view = await service.getMyMerit(admin, "SCHOOL");

    expect(view.totals).toEqual({ merit: 0, demerit: 0, offset: 0, net: 0 });
    expect(view.awards).toEqual([]);
  });

  it("두 번째 인자를 학생 id처럼 넘겨도 세션 학생만 조회한다", async () => {
    // 시그니처 길이만 재던 예전 단언은 (user, studentProfileId, track) 형태여도
    // 그대로 통과해서, 검사하려던 것을 실제로 검사하지 못했다. 두 번째 인자가
    // track이라는 사실을 동작으로 확인한다 — 남의 id를 넣어도 repo에는 세션에서
    // 유도한 sp-1만 간다.
    findStudentProfileByUserId.mockResolvedValue({
      id: "sp-1",
      user: { name: "김민준" },
    });

    await service.getMyMerit(student, "SCHOOL");

    expect(findStudentProfileByUserId).toHaveBeenCalledWith(student.id);
    expect(totals).toHaveBeenCalledWith(
      expect.objectContaining({ studentProfileId: "sp-1", track: "SCHOOL" }),
    );
    // 호출 인자 어디에도 남의 id가 끼어들 자리가 없다.
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

  it("한 번에 여러 건을 넣고 같은 batchId로 묶는다", async () => {
    await service.bulkAwardMerit(admin, bulk, NOW);

    expect(createAwards).toHaveBeenCalledTimes(1);
    const items = createAwards.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0].batchId).toBeTruthy();
    expect(items[0].batchId).toBe(items[1].batchId);
  });

  it("감사로그는 학생 수만큼 남는다 — 건별 추적이 가능해야 한다", async () => {
    await service.bulkAwardMerit(admin, bulk, NOW);

    const meritLogs = recordAudit.mock.calls.filter(
      ([arg]) => arg.action === "merit:award",
    );
    expect(meritLogs).toHaveLength(2);
    expect(meritLogs[0][0].metadata).toEqual(
      expect.objectContaining({ batchId: expect.any(String) }),
    );
  });

  it("한 명이라도 없는 학생이면 아무것도 넣지 않는다", async () => {
    // 한 번에 조회하므로 "못 찾음"은 결과 길이가 모자란 것으로 나타난다.
    findStudentProfilesByIds.mockResolvedValue([
      { id: "sp-1", studentCode: "C", user: { id: "u", name: "n" } },
    ]);

    await expect(service.bulkAwardMerit(admin, bulk, NOW)).rejects.toThrow(
      "STUDENT_NOT_FOUND",
    );
    expect(createAwards).not.toHaveBeenCalled();
  });

  it("학생 조회는 한 번만 한다 — 예전엔 인원수만큼 순차로 돌았다", async () => {
    await service.bulkAwardMerit(admin, bulk, NOW);

    expect(findStudentProfilesByIds).toHaveBeenCalledTimes(1);
    expect(findStudentProfilesByIds).toHaveBeenCalledWith(["sp-1", "sp-2"]);
    expect(findStudentProfileById).not.toHaveBeenCalled();
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
    findRule.mockResolvedValue({ ...SCHOOL_RULE, active: false });

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

  it("기숙사는 합계만 누적으로 센다 — 반은 그 학년도 기준이다", async () => {
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

describe("학부모 조회", () => {
  const parent = user("PARENT", "p-1");

  it("연결된 자녀는 볼 수 있다", async () => {
    isChildOf.mockResolvedValue(true);

    await service.getChildMerit(parent, "sp-1", "SCHOOL");

    expect(isChildOf).toHaveBeenCalledWith("p-1", "sp-1");
    expect(totals).toHaveBeenCalled();
  });

  it("연결되지 않은 학생은 못 본다 — 거부 감사로그가 남는다", async () => {
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
