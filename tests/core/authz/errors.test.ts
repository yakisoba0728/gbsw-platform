import { beforeEach, describe, expect, it, vi } from "vitest";

const recordAudit = vi.fn();
vi.mock("@/core/audit/audit", () => ({ recordAudit }));

const { assertCan, ForbiddenError } = await import("@/core/authz/errors");

/**
 * 권한 거부의 단일 경로. 한 번에 세 가지를 한다 —
 * can() 검사 / authz:denied 감사로그 / ForbiddenError throw.
 *
 * 감사로그가 남는다는 것은 네 개 서비스 테스트가 간접적으로 확인하지만,
 * **"감사 기록이 실패해도 거부는 그대로 던진다"**는 try/catch 분기는 지금까지
 * 어디서도 검증되지 않았다. 그 분기가 죽으면 감사 DB가 흔들리는 순간 권한 거부가
 * 통째로 다른 오류로 바뀐다 — 액션의 catch는 그걸 "일시적 장애"로 읽고 일반
 * 문구를 내보내며, 권한 침해 시도와 장애가 다시 똑같이 보이게 된다.
 * (이 헬퍼가 생긴 이유가 바로 그 둘을 가르는 것이었다.)
 *
 * can()은 목하지 않는다 — 실제 표(RULES)를 그대로 태워야 "허용인데 막힌다"·
 * "거부인데 통과한다"를 잡을 수 있다.
 */

const ADMIN = { id: "admin-1", role: "ADMIN" };
const STUDENT = { id: "stu-1", role: "STUDENT" };

describe("ForbiddenError", () => {
  it("Error를 상속한다 — 액션의 catch가 instanceof로 가른다", () => {
    const error = new ForbiddenError("user:manage");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.name).toBe("ForbiddenError");
  });

  it("message는 항상 정확히 \"FORBIDDEN\"이다 — 옛 `throw new Error(\"FORBIDDEN\")`을 잡던 자리(.rejects.toThrow(\"FORBIDDEN\"))가 그대로 통과해야 한다", () => {
    expect(new ForbiddenError("user:manage").message).toBe("FORBIDDEN");
    expect(new ForbiddenError("merit:award").message).toBe("FORBIDDEN");
  });

  it("어떤 액션에서 막혔는지는 action 필드에만 남는다 — message가 고정이라 여기가 유일한 단서다", () => {
    expect(new ForbiddenError("merit:cancel").action).toBe("merit:cancel");
  });
});

describe("assertCan() — 통과", () => {
  beforeEach(() => {
    recordAudit.mockReset().mockResolvedValue(undefined);
  });

  it("권한이 있으면 던지지 않는다", async () => {
    await expect(assertCan(ADMIN, "user:manage")).resolves.toBeUndefined();
  });

  it("허용은 감사로그를 남기지 않는다 — 정상 통과까지 기록하면 authz 로그가 잡음에 묻혀 거부를 못 찾는다", async () => {
    await assertCan(ADMIN, "user:manage");
    await assertCan(ADMIN, "merit:award");
    await assertCan(STUDENT, "invite:create:parent"); // 학생에게 허용된 유일한 액션
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("assertCan() — 거부", () => {
  beforeEach(() => {
    recordAudit.mockReset().mockResolvedValue(undefined);
  });

  it("ForbiddenError를 던진다", async () => {
    await expect(assertCan(STUDENT, "user:manage")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("message로 잡던 기존 테스트·catch가 그대로 통과한다", async () => {
    await expect(assertCan(STUDENT, "user:manage")).rejects.toThrow("FORBIDDEN");
  });

  it("막힌 액션을 error.action에 실어 보낸다", async () => {
    await expect(assertCan(STUDENT, "merit:award")).rejects.toMatchObject({
      message: "FORBIDDEN",
      action: "merit:award",
    });
    await expect(assertCan(STUDENT, "audit:read")).rejects.toMatchObject({
      action: "audit:read",
    });
  });

  it("거부를 authz:denied로 남긴다 — 페이지 가드를 건너뛴 직접 호출이 흔적 없이 지나가지 않게", async () => {
    await expect(assertCan(STUDENT, "user:manage")).rejects.toThrow();

    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith({
      actorUserId: "stu-1",
      action: "authz:denied",
      targetType: "Authz",
      metadata: { action: "user:manage" },
    });
  });

  it("어떤 권한에서 막혔는지는 metadata.action에 담긴다 — action 칸은 authz:denied로 고정이다", async () => {
    await expect(assertCan(STUDENT, "merit:cancel")).rejects.toThrow();

    expect(recordAudit.mock.calls[0]![0]).toMatchObject({
      action: "authz:denied",
      metadata: { action: "merit:cancel" },
    });
  });

  it("역할을 알 수 없는 계정도 거부하고 기록한다", async () => {
    await expect(assertCan({ id: "u-9", role: null }, "user:manage")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(assertCan({ id: "u-9" }, "user:manage")).rejects.toBeInstanceOf(ForbiddenError);
    expect(recordAudit).toHaveBeenCalledTimes(2);
  });
});

describe("assertCan() — 감사 기록이 실패해도 거부는 그대로 나간다", () => {
  beforeEach(() => {
    recordAudit.mockReset();
  });

  it("recordAudit이 거부(reject)해도 ForbiddenError가 나온다 — 감사 DB 장애가 권한 거부를 다른 오류로 바꾸면 안 된다", async () => {
    recordAudit.mockRejectedValue(new Error("감사 DB 연결 실패"));

    await expect(assertCan(STUDENT, "user:manage")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assertCan(STUDENT, "user:manage")).rejects.toThrow("FORBIDDEN");
    expect(recordAudit).toHaveBeenCalledTimes(2);
  });

  it("recordAudit이 그 자리에서 던져도(비동기 이전) 마찬가지다", async () => {
    recordAudit.mockImplementation(() => {
      throw new TypeError("감사 모듈이 깨졌다");
    });

    const error = await assertCan(STUDENT, "merit:award").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toMatchObject({ message: "FORBIDDEN", action: "merit:award" });
  });

  it("감사 기록의 실패 원인이 거부 오류를 덮어쓰지 않는다 — 삼킨 오류가 새어 나오면 원인 추적이 뒤집힌다", async () => {
    const auditFailure = new Error("감사 DB 연결 실패");
    recordAudit.mockRejectedValue(auditFailure);

    const error = await assertCan(STUDENT, "user:manage").catch((e: unknown) => e);
    expect(error).not.toBe(auditFailure);
    expect(error).toBeInstanceOf(ForbiddenError);
  });
});

describe("assertCan() — 행위자가 없을 때", () => {
  beforeEach(() => {
    recordAudit.mockReset().mockResolvedValue(undefined);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("actor가 %s이면 감사로그 없이 던진다 — 남길 actorUserId가 없다 (미로그인 요청)", async (_label, actor) => {
    await expect(assertCan(actor, "user:manage")).rejects.toBeInstanceOf(ForbiddenError);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("미로그인이어도 막힌 액션은 error.action에 담긴다", async () => {
    await expect(assertCan(null, "merit:read:any")).rejects.toMatchObject({
      action: "merit:read:any",
    });
  });
});
