import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

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
});

const awardInput = { studentProfileId: "sp-1", ruleId: "r-1", note: null };

describe("awardMerit", () => {
  it("규정 값을 스냅샷해서 넣는다", async () => {
    await service.awardMerit(admin, awardInput);

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
    await service.awardMerit(admin, awardInput);

    expect(createAward).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2027 }),
    );
  });

  it("감사로그에 트랙·종류·점수가 남는다", async () => {
    await service.awardMerit(admin, awardInput);

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

    await expect(service.awardMerit(admin, awardInput)).rejects.toThrow(
      "RULE_INACTIVE",
    );
    expect(createAward).not.toHaveBeenCalled();
  });

  it("없는 규정은 RULE_NOT_FOUND", async () => {
    findRule.mockResolvedValue(null);
    await expect(service.awardMerit(admin, awardInput)).rejects.toThrow(
      "RULE_NOT_FOUND",
    );
  });

  it("없는 학생은 STUDENT_NOT_FOUND — 소프트 삭제된 학생도 여기 걸린다", async () => {
    findStudentProfileById.mockResolvedValue(null);
    await expect(service.awardMerit(admin, awardInput)).rejects.toThrow(
      "STUDENT_NOT_FOUND",
    );
    expect(createAward).not.toHaveBeenCalled();
  });

  it("학생은 상벌점을 줄 수 없다", async () => {
    await expect(service.awardMerit(student, awardInput)).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(createAward).not.toHaveBeenCalled();
  });
});

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
    note: null,
  };

  it("한 번에 여러 건을 넣고 같은 batchId로 묶는다", async () => {
    await service.bulkAwardMerit(admin, bulk);

    expect(createAwards).toHaveBeenCalledTimes(1);
    const items = createAwards.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0].batchId).toBeTruthy();
    expect(items[0].batchId).toBe(items[1].batchId);
  });

  it("감사로그는 학생 수만큼 남는다 — 건별 추적이 가능해야 한다", async () => {
    await service.bulkAwardMerit(admin, bulk);

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

    await expect(service.bulkAwardMerit(admin, bulk)).rejects.toThrow(
      "STUDENT_NOT_FOUND",
    );
    expect(createAwards).not.toHaveBeenCalled();
  });

  it("학생 조회는 한 번만 한다 — 예전엔 인원수만큼 순차로 돌았다", async () => {
    await service.bulkAwardMerit(admin, bulk);

    expect(findStudentProfilesByIds).toHaveBeenCalledTimes(1);
    expect(findStudentProfilesByIds).toHaveBeenCalledWith(["sp-1", "sp-2"]);
    expect(findStudentProfileById).not.toHaveBeenCalled();
  });

  it("중복 선택은 한 번만 들어간다", async () => {
    await service.bulkAwardMerit(admin, {
      ...bulk,
      studentProfileIds: ["sp-1", "sp-1", "sp-2"],
    });

    expect(createAwards.mock.calls[0][0]).toHaveLength(2);
  });

  it("비활성 규정으로는 일괄도 못 준다", async () => {
    findRule.mockResolvedValue({ ...SCHOOL_RULE, active: false });

    await expect(service.bulkAwardMerit(admin, bulk)).rejects.toThrow(
      "RULE_INACTIVE",
    );
    expect(createAwards).not.toHaveBeenCalled();
  });

  it("학생은 일괄 부여를 할 수 없다", async () => {
    await expect(service.bulkAwardMerit(student, bulk)).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(createAwards).not.toHaveBeenCalled();
  });

  it("돌려주는 건수가 실제로 넣은 수와 같다", async () => {
    const result = await service.bulkAwardMerit(admin, bulk);
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
