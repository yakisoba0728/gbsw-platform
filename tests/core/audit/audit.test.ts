import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const findUnique = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: { auditLog: { create }, user: { findUnique } },
}));

// next/headers는 요청 컨텍스트 밖에서 못 쓴다. 읽기 함수만 갈아끼운다.
const readRequestContext = vi.fn();
vi.mock("@/core/audit/request-context", () => ({ readRequestContext }));

const { recordAudit } = await import("@/core/audit/audit");

describe("recordAudit()", () => {
  beforeEach(() => {
    create.mockReset();
    findUnique.mockReset().mockResolvedValue({ name: "김동혁" });
    readRequestContext
      .mockReset()
      .mockResolvedValue({ ip: null, userAgent: null });
  });

  it("전달받은 값 그대로 감사 행을 만든다", async () => {
    await recordAudit({
      actorUserId: "u1",
      action: "student:manage",
      targetType: "StudentProfile",
      targetId: "s1",
      metadata: { grade: 2 },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorUserId: "u1",
        actorName: "김동혁",
        action: "student:manage",
        targetType: "StudentProfile",
        targetId: "s1",
        metadata: { grade: 2 },
        ip: null,
        userAgent: null,
      },
    });
  });

  it("targetId가 없으면 null로 저장한다", async () => {
    await recordAudit({
      actorUserId: "u1",
      action: "user:manage",
      targetType: "User",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorUserId: "u1",
        actorName: "김동혁",
        action: "user:manage",
        targetType: "User",
        targetId: null,
        metadata: undefined,
        ip: null,
        userAgent: null,
      },
    });
  });

  it("요청 접속 정보를 함께 남긴다", async () => {
    readRequestContext.mockResolvedValue({
      ip: "203.0.113.9",
      userAgent: "Mozilla/5.0",
    });

    await recordAudit({
      actorUserId: "u1",
      action: "user:manage",
      targetType: "User",
    });

    expect(create.mock.calls[0]![0].data).toMatchObject({
      ip: "203.0.113.9",
      userAgent: "Mozilla/5.0",
    });
  });

  it("행위자 이름을 조회해 함께 저장한다", async () => {
    findUnique.mockResolvedValue({ name: "최고관리자" });

    await recordAudit({
      actorUserId: "u2",
      action: "user:manage",
      targetType: "User",
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "u2" },
      select: { name: true },
    });
    expect(create.mock.calls[0]![0].data).toMatchObject({
      actorName: "최고관리자",
    });
  });

  it("계정을 못 찾아도 던지지 않고 (알 수 없음)으로 남긴다", async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      recordAudit({
        actorUserId: "ghost",
        action: "user:manage",
        targetType: "User",
      }),
    ).resolves.toBeUndefined();

    expect(create.mock.calls[0]![0].data).toMatchObject({
      actorName: "(알 수 없음)",
    });
  });

  it("이름 조회가 실패해도 던지지 않고 (알 수 없음)으로 남긴다", async () => {
    findUnique.mockRejectedValue(new Error("DB down"));

    await expect(
      recordAudit({
        actorUserId: "u1",
        action: "user:manage",
        targetType: "User",
      }),
    ).resolves.toBeUndefined();

    expect(create.mock.calls[0]![0].data).toMatchObject({
      actorName: "(알 수 없음)",
    });
  });

  it("actorUserId가 null이어도 저장한다 (I9) — 행위자 없는 사건(가입 시도 자동 폐기 등)", async () => {
    await recordAudit({
      actorUserId: null,
      actorName: "(가입 시도자)",
      action: "invite:auto-revoke",
      targetType: "Invite",
      targetId: "inv1",
    });

    expect(findUnique).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: {
        actorUserId: null,
        actorName: "(가입 시도자)",
        action: "invite:auto-revoke",
        targetType: "Invite",
        targetId: "inv1",
        metadata: undefined,
        ip: null,
        userAgent: null,
      },
    });
  });

  it("actorName을 넘기면 조회를 건너뛴다 (M8) — 배치 호출이 매번 이름을 다시 묻지 않게", async () => {
    await recordAudit({
      actorUserId: "u1",
      actorName: "캐시된 이름",
      action: "user:delete",
      targetType: "User",
    });

    expect(findUnique).not.toHaveBeenCalled();
    expect(create.mock.calls[0]![0].data).toMatchObject({
      actorName: "캐시된 이름",
    });
  });

  it("actorName을 넘기지 않으면 예전처럼 매번 조회한다", async () => {
    await recordAudit({
      actorUserId: "u1",
      action: "user:manage",
      targetType: "User",
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { name: true },
    });
  });

  it("actorUserId가 null이고 actorName도 없으면 (알 수 없음)으로 떨어진다", async () => {
    await recordAudit({
      actorUserId: null,
      action: "invite:auto-revoke",
      targetType: "Invite",
    });

    expect(findUnique).not.toHaveBeenCalled();
    expect(create.mock.calls[0]![0].data).toMatchObject({
      actorName: "(알 수 없음)",
    });
  });
});
