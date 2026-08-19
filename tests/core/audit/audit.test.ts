import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/core/db/client";

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

  it("actorUserId가 null이어도 저장한다 (I9)", async () => {
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

  it("actorName을 넘기면 조회를 건너뛴다 (M8)", async () => {
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

  it("actorUserId도 actorName도 없으면 (알 수 없음)으로 떨어진다", async () => {
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

  it("트랜잭션 클라이언트를 받으면 행위자 조회와 감사 생성 모두 그 클라이언트만 쓴다", async () => {
    const txFindUnique = vi.fn().mockResolvedValue({ name: "트랜잭션 관리자" });
    const txCreate = vi.fn().mockResolvedValue({});
    const tx = {
      auditLog: { create: txCreate },
      user: { findUnique: txFindUnique },
    } as unknown as DbClient;

    await recordAudit(
      {
        actorUserId: "tx-user",
        action: "academic-year:set-current",
        targetType: "AcademicYear",
        targetId: "8105",
      },
      tx,
    );

    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(txFindUnique).toHaveBeenCalledWith({
      where: { id: "tx-user" },
      select: { name: true },
    });
    expect(txCreate).toHaveBeenCalledWith({
      data: {
        actorUserId: "tx-user",
        actorName: "트랜잭션 관리자",
        action: "academic-year:set-current",
        targetType: "AcademicYear",
        targetId: "8105",
        metadata: undefined,
        ip: null,
        userAgent: null,
      },
    });
  });

  it("트랜잭션 클라이언트의 행위자 조회가 실패해도 같은 클라이언트로 (알 수 없음)을 기록한다", async () => {
    const txFindUnique = vi.fn().mockRejectedValue(new Error("tx lookup failed"));
    const txCreate = vi.fn().mockResolvedValue({});
    const tx = {
      auditLog: { create: txCreate },
      user: { findUnique: txFindUnique },
    } as unknown as DbClient;

    await expect(
      recordAudit(
        {
          actorUserId: "tx-user",
          action: "user:manage",
          targetType: "User",
        },
        tx,
      ),
    ).resolves.toBeUndefined();

    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(txCreate.mock.calls[0]![0].data).toMatchObject({
      actorName: "(알 수 없음)",
    });
  });

  it("AuditLog.create 실패는 삼키지 않고 호출자에게 전파한다", async () => {
    const failure = new Error("audit insert failed");
    create.mockRejectedValue(failure);

    await expect(
      recordAudit({
        actorUserId: "u1",
        action: "user:manage",
        targetType: "User",
      }),
    ).rejects.toBe(failure);
  });
});
