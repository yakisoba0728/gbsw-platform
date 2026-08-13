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
});
