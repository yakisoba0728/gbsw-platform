import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

const findPage = vi.fn();
const countMatching = vi.fn();
const distinctActions = vi.fn();
const { recordAudit } = coreMocks("audit-log-service-test");

vi.mock("@/modules/audit-log/audit-log.repo", () => ({
  findPage,
  countMatching,
  distinctActions,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));

const { readAuditLog } = await import("@/modules/audit-log/audit-log.service");
const { PAGE_SIZE, periodStart } = await import(
  "@/modules/audit-log/audit-log.schema"
);

const admin = user("ADMIN", "u1");
const base = { period: "7d", page: 1 } as const;

beforeEach(() => {
  findPage.mockReset().mockResolvedValue([]);
  countMatching.mockReset().mockResolvedValue(0);
  distinctActions.mockReset().mockResolvedValue(["invite:create"]);
  recordAudit.mockReset();
});

describe("readAuditLog()", () => {
  it("관리자가 아니면 볼 수 없다", async () => {
    await expect(readAuditLog(user("STUDENT", "u1"), { ...base })).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(readAuditLog(user("PARENT", "u1"), { ...base })).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(findPage).not.toHaveBeenCalled();
  });

  it("권한 거부를 감사로그에 남긴다 (I5) — 페이지 가드 없이 직접 호출해도 흔적이 남는다", async () => {
    await expect(readAuditLog(user("STUDENT", "u1"), { ...base })).rejects.toThrow(
      "FORBIDDEN",
    );

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "u1",
        action: "authz:denied",
        targetType: "Authz",
        metadata: { action: "audit:read" },
      }),
    );
  });

  it("페이지 번호를 건너뛸 개수로 바꾼다", async () => {
    await readAuditLog(admin, { ...base, page: 3 });

    const [, skip, take] = findPage.mock.calls[0]!;
    expect(skip).toBe(PAGE_SIZE * 2);
    expect(take).toBe(PAGE_SIZE);
  });

  it("빈 문자열 필터는 조건에서 뺀다", async () => {
    await readAuditLog(admin, { ...base, action: "", actor: "" });

    const [filter] = findPage.mock.calls[0]!;
    expect(filter.action).toBeUndefined();
    expect(filter.actor).toBeUndefined();
  });

  it("전체 기간이면 시각 하한이 없다", async () => {
    await readAuditLog(admin, { ...base, period: "all" });

    expect(findPage.mock.calls[0]![0].since).toBeNull();
  });

  it("총 건수로 페이지 수를 계산한다", async () => {
    countMatching.mockResolvedValue(PAGE_SIZE * 2 + 1);

    const result = await readAuditLog(admin, { ...base });

    expect(result.pageCount).toBe(3);
  });

  it("기록이 없어도 페이지 수는 1이다", async () => {
    const result = await readAuditLog(admin, { ...base });
    expect(result.pageCount).toBe(1);
  });
});

describe("periodStart()", () => {
  const now = new Date("2026-08-13T02:30:00Z");

  it("오늘은 KST 자정부터다 — 서버 타임존과 무관하게", () => {
    expect(periodStart("today", now)?.toISOString()).toBe(
      "2026-08-12T15:00:00.000Z",
    );
  });

  it("7일·30일은 현재로부터 거슬러 센다", () => {
    expect(periodStart("7d", now)?.toISOString()).toBe(
      "2026-08-06T02:30:00.000Z",
    );
    expect(periodStart("30d", now)?.toISOString()).toBe(
      "2026-07-14T02:30:00.000Z",
    );
  });

  it("전체는 하한이 없다", () => {
    expect(periodStart("all", now)).toBeNull();
  });
});
