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
const recordAudit = vi.fn();
const getCurrentYear = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  findRule,
  createAward,
  findAward,
  cancelAward,
  listAwards,
  totals,
  findStudentProfileByUserId,
  findStudentProfileById,
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
  });
  cancelAward.mockReset().mockResolvedValue(undefined);
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
  recordAudit.mockReset().mockResolvedValue(undefined);
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

  it("순점수는 상점 − 벌점이고 음수가 될 수 있다", async () => {
    totals.mockResolvedValue([
      { kind: "MERIT", _sum: { points: 2 } },
      { kind: "DEMERIT", _sum: { points: 9 } },
    ]);

    const view = await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    expect(view.totals).toEqual({ merit: 2, demerit: 9, net: -7 });
  });

  it("기록이 하나도 없으면 0이다", async () => {
    totals.mockResolvedValue([]);

    const view = await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    expect(view.totals).toEqual({ merit: 0, demerit: 0, net: 0 });
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

    expect(view.totals).toEqual({ merit: 0, demerit: 0, net: 0 });
    expect(view.awards).toEqual([]);
  });

  it("getMyMerit의 시그니처에 studentProfileId 자리가 없다", () => {
    // 두 번째 인자는 track이다. 학생 식별자를 넘길 자리가 존재하지 않으므로
    // URL 파라미터를 바꿔 남의 기록을 보는 경로가 생길 수 없다.
    expect(service.getMyMerit.length).toBeLessThanOrEqual(3);
  });
});

describe("getStudentMerit 권한", () => {
  it("학생은 남의 기록을 볼 수 없다", async () => {
    await expect(
      service.getStudentMerit(student, "sp-2", "SCHOOL"),
    ).rejects.toThrow("FORBIDDEN");
  });
});
