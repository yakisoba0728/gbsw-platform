import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: { auditLog: { create } },
}));

// next/headers는 요청 컨텍스트 밖에서 못 쓴다. 읽기 함수만 갈아끼운다.
const readRequestContext = vi.fn();
vi.mock("@/core/audit/request-context", () => ({ readRequestContext }));

const { recordAudit } = await import("@/core/audit/audit");

describe("recordAudit()", () => {
  beforeEach(() => {
  create.mockReset();
  readRequestContext.mockReset().mockResolvedValue({ ip: null, userAgent: null });
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
});
