import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const createRule = vi.fn();
const findRule = vi.fn();
const updateRule = vi.fn();
const markRuleDeleted = vi.fn();
const listRules = vi.fn();
const listActiveRules = vi.fn();
const recordAudit = vi.fn();
const txClient = { tx: "merit-rule-service-test" };
const withTransaction = vi.fn(
  async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
);

vi.mock("@/modules/merit/merit.repo", () => ({
  createRule,
  findRule,
  updateRule,
  markRuleDeleted,
  listRules,
  listActiveRules,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { MeritError } = await import("@/modules/merit/merit.error");
const service = await import("@/modules/merit/rule.service");

function user(role: SessionUser["role"], id = "admin-1"): SessionUser {
  return {
    id,
    name: "테스트",
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const admin = user("ADMIN");
const student = user("STUDENT", "s-1");
const parent = user("PARENT", "p-1");

const input = {
  track: "SCHOOL" as const,
  kind: "MERIT" as const,
  label: "교내 봉사활동 우수 참여",
  points: 5,
  category: "봉사",
  description: null,
};

const UPDATED_AT = new Date("2026-08-19T00:00:00.000Z");

beforeEach(() => {
  createRule.mockReset().mockResolvedValue({ id: "r-1" });
  findRule.mockReset().mockResolvedValue({
    id: "r-1",
    track: "SCHOOL",
    kind: "MERIT",
    label: "교내 봉사활동 우수 참여",
    points: 5,
    category: "봉사",
    description: null,
    active: true,
    updatedAt: UPDATED_AT,
  });
  updateRule.mockReset().mockResolvedValue(true);
  markRuleDeleted.mockReset().mockResolvedValue(1);
  listRules.mockReset().mockResolvedValue([]);
  listActiveRules.mockReset().mockResolvedValue([]);
  recordAudit.mockReset().mockResolvedValue(undefined);
  withTransaction
    .mockReset()
    .mockImplementation(
      async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
    );
});

describe("createRule", () => {
  it("관리자는 규정을 추가하고 감사로그가 남는다", async () => {
    await service.createRule(admin, input);

    expect(createRule).toHaveBeenCalledWith(input, txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: admin.id,
        action: "merit:rule:create",
        targetType: "MeritRule",
        targetId: "r-1",
        metadata: expect.objectContaining({
          track: "SCHOOL",
          kind: "MERIT",
          points: 5,
        }),
      }),
      txClient,
    );
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["학생", student],
    ["학부모", parent],
  ])("%s는 규정을 추가할 수 없다", async (_label, actor) => {
    await expect(service.createRule(actor, input)).rejects.toThrow("FORBIDDEN");
    expect(createRule).not.toHaveBeenCalled();
  });
});

describe("updateRule", () => {
  const patch = {
    ruleId: "r-1",
    updatedAt: UPDATED_AT,
    label: "고친 이름",
    points: 7,
    category: null,
    description: null,
  };

  it("바뀐 항목만 감사로그의 changed에 담는다", async () => {
    await service.updateRule(admin, patch);

    expect(updateRule).toHaveBeenCalledWith(
      "r-1",
      {
        label: "고친 이름",
        points: 7,
        category: null,
        description: null,
      },
      UPDATED_AT,
      txClient,
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merit:rule:update",
        metadata: expect.objectContaining({
          changed: expect.arrayContaining(["label", "points", "category"]),
        }),
      }),
      txClient,
    );
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it("아무것도 안 바뀌었으면 쓰지도, 기록하지도 않는다", async () => {
    await service.updateRule(admin, {
      ruleId: "r-1",
      updatedAt: UPDATED_AT,
      label: "교내 봉사활동 우수 참여",
      points: 5,
      category: "봉사",
      description: null,
    });

    expect(updateRule).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("없는 규정은 RULE_NOT_FOUND", async () => {
    findRule.mockResolvedValue(null);
    await expect(service.updateRule(admin, patch)).rejects.toThrow(MeritError);
    await expect(service.updateRule(admin, patch)).rejects.toThrow("RULE_NOT_FOUND");
  });

  it("학생은 규정을 고칠 수 없다", async () => {
    await expect(service.updateRule(student, patch)).rejects.toThrow("FORBIDDEN");
    expect(updateRule).not.toHaveBeenCalled();
  });

  it("화면을 연 뒤 다른 관리자가 수정했으면 감사 없이 충돌로 거부한다", async () => {
    updateRule.mockResolvedValue(false);

    await expect(service.updateRule(admin, patch)).rejects.toThrow("RULE_CONFLICT");

    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("deleteRule", () => {
  const deletion = { ruleId: "r-1", updatedAt: UPDATED_AT, reason: "규정 개정" };

  it("관리자는 규정을 삭제한다", async () => {
    await service.deleteRule(admin, deletion);

    expect(markRuleDeleted).toHaveBeenCalledWith("r-1", UPDATED_AT, txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merit:rule:delete",
        targetId: "r-1",
      }),
      txClient,
    );
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it("삭제 직전 다른 요청이 먼저 지웠으면 감사로그를 남기지 않는다", async () => {
    markRuleDeleted.mockResolvedValue(0);
    findRule
      .mockResolvedValueOnce({
        id: "r-1",
        track: "SCHOOL",
        kind: "MERIT",
        label: "x",
        points: 5,
        category: null,
        description: null,
        active: true,
        updatedAt: UPDATED_AT,
      })
      .mockResolvedValueOnce({ active: false });

    await service.deleteRule(admin, deletion);

    expect(markRuleDeleted).toHaveBeenCalledWith("r-1", UPDATED_AT, txClient);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("삭제 직전 다른 요청이 수정했으면 최신 스냅샷을 지우거나 감사하지 않는다", async () => {
    findRule.mockResolvedValue({
      id: "r-1",
      track: "SCHOOL",
      kind: "MERIT",
      label: "최신 이름",
      points: 9,
      category: null,
      description: null,
      active: true,
      updatedAt: new Date(UPDATED_AT.getTime() + 1_000),
    });

    await expect(service.deleteRule(admin, deletion)).rejects.toThrow("RULE_CONFLICT");

    expect(markRuleDeleted).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("사유를 감사로그에 남긴다 — 항목이 사라진 이유를 되짚을 자료가 이것뿐이다", async () => {
    await service.deleteRule(admin, { ...deletion, reason: "규정 개정으로 없어짐" });

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: "규정 개정으로 없어짐" }),
      }),
      txClient,
    );
  });

  it("권한이 없으면 삭제하지 못한다", async () => {
    await expect(
      service.deleteRule(student, { ...deletion, reason: "x" }),
    ).rejects.toThrow("FORBIDDEN");

    expect(markRuleDeleted).not.toHaveBeenCalled();
  });

  it("이미 지워진 규정이면 아무 일도 하지 않는다", async () => {
    findRule.mockResolvedValue({
      id: "r-1",
      track: "SCHOOL",
      kind: "MERIT",
      label: "x",
      points: 5,
      category: null,
      description: null,
      active: false,
    });

    await service.deleteRule(admin, { ...deletion, reason: "x" });

    expect(markRuleDeleted).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("없는 규정은 RULE_NOT_FOUND", async () => {
    findRule.mockResolvedValue(null);
    await expect(
      service.deleteRule(admin, { ...deletion, reason: "x" }),
    ).rejects.toThrow(
      "RULE_NOT_FOUND",
    );
  });
});

describe("조회", () => {
  it("listRules는 관리자만", async () => {
    await service.listRules(admin, "SCHOOL");
    expect(listRules).toHaveBeenCalledWith("SCHOOL");

    await expect(service.listRules(student, "SCHOOL")).rejects.toThrow("FORBIDDEN");
  });

  it("listActiveRules는 부여 권한으로 막는다", async () => {
    await service.listActiveRules(admin, "DORM");
    expect(listActiveRules).toHaveBeenCalledWith("DORM");

    await expect(service.listActiveRules(parent, "DORM")).rejects.toThrow(
      "FORBIDDEN",
    );
  });
});
