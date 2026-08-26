import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const createPass = vi.fn();
const findPassForVerify = vi.fn();
const transition = vi.fn();
const displayYear = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/modules/pass/pass.repo", () => ({
  createPass,
  findPassForVerify,
  transition,
  displayYear,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));

const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/pass/verify.service");
const { issueToken } = await import("@/modules/pass/pass.token");

function user(role: SessionUser["role"], id: string): SessionUser {
  return {
    id,
    name: "테스트",
    email: `${id}@gbsw.hs.kr`,
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const student = user("STUDENT", "u-student");
const parent = user("PARENT", "u-parent");
const admin = user("ADMIN", "u-admin");

const NOW = new Date("2026-08-27T06:00:00.000Z"); // 15:00 KST

function stored(over: Record<string, unknown> = {}) {
  return {
    id: "clx0000000000000000000abc",
    studentProfileId: "sp-1",
    type: "OUTING",
    status: "APPROVED",
    startAt: new Date("2026-08-27T05:00:00.000Z"), // 14:00
    endAt: new Date("2026-08-27T09:00:00.000Z"), // 18:00
    destination: "치과",
    reason: "정기 검진",
    studentProfile: {
      id: "sp-1",
      user: { id: "u-1", name: "김민준", role: "STUDENT" },
      enrollments: [{ number: 7, schoolClass: { grade: 1, classNo: 3 } }],
    },
    ...over,
  };
}

function tokenFor(passId = "clx0000000000000000000abc", at = NOW): string {
  return issueToken(passId, at).token;
}

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-pass-token-0123456789";
  createPass.mockReset().mockResolvedValue({ id: "p-1" });
  findPassForVerify.mockReset().mockResolvedValue(null);
  transition.mockReset().mockResolvedValue(1);
  displayYear.mockReset().mockResolvedValue(2026);
  recordAudit.mockReset().mockResolvedValue(undefined);
});

describe("verifyPassToken", () => {
  it("유효한 창 안이면 VALID이고 이름·학번이 나온다", async () => {
    findPassForVerify.mockResolvedValue(stored());
    const result = await service.verifyPassToken(admin, tokenFor(), NOW);

    expect(result.verdict).toBe("VALID");
    expect(result.pass?.studentName).toBe("김민준");
    expect(result.pass?.studentNumber).toBe("1307");
  });

  it.each([
    ["아직 시작 전", new Date("2026-08-27T04:30:00.000Z"), "NOT_YET"],
    ["기간이 지남", new Date("2026-08-27T10:00:00.000Z"), "EXPIRED"],
  ])("%s → %s", async (_label, at, expected) => {
    findPassForVerify.mockResolvedValue(stored());
    // 토큰은 그 시각의 것이어야 STALE로 안 떨어진다
    const result = await service.verifyPassToken(admin, tokenFor(undefined, at), at);
    expect(result.verdict).toBe(expected);
  });

  it.each([
    ["REQUESTED", "NOT_APPROVED"],
    ["CONSENTED", "NOT_APPROVED"],
    ["REJECTED", "REJECTED"],
    ["CANCELLED", "CANCELLED"],
  ])("상태 %s → %s", async (status, expected) => {
    findPassForVerify.mockResolvedValue(stored({ status }));
    const result = await service.verifyPassToken(admin, tokenFor(), NOW);
    expect(result.verdict).toBe(expected);
  });

  it("20초가 두 번 지난 토큰은 STALE이고 이름은 그대로 보인다", async () => {
    findPassForVerify.mockResolvedValue(stored());
    const old = tokenFor(undefined, new Date(NOW.getTime() - 60_000));
    const result = await service.verifyPassToken(admin, old, NOW);

    expect(result.verdict).toBe("STALE");
    // 「김민준 학생, 화면을 새로 고쳐 주세요」를 말할 수 있어야 한다
    expect(result.pass?.studentName).toBe("김민준");
  });

  it("STALE에서는 교사에게도 사유·행선지가 안 나온다 — 서명이 안 맞은 길이다", async () => {
    findPassForVerify.mockResolvedValue(stored());
    // passId만 알면 아무 서명이나 붙여 여기까지 올 수 있다. 이름·유형·기간은
    // 「누구의 화면이 굳었는지」를 말하는 데 필요해 남기고, 그보다 안쪽은 닫는다.
    const forged = "clx0000000000000000000abc.AAAAAAAAAAAAAAAA";
    const result = await service.verifyPassToken(admin, forged, NOW);

    expect(result.verdict).toBe("STALE");
    expect(result.pass?.studentName).toBe("김민준");
    expect(result.detailed).toBe(false);
    expect(result.pass?.destination).toBeNull();
    expect(result.pass?.reason).toBeNull();
  });

  it("서명은 지났는데 그 출입증이 아예 없으면 UNKNOWN이다", async () => {
    findPassForVerify.mockResolvedValue(null);
    const old = tokenFor(undefined, new Date(NOW.getTime() - 60_000));
    const result = await service.verifyPassToken(admin, old, NOW);

    expect(result.verdict).toBe("UNKNOWN");
    expect(result.pass).toBeNull();
  });

  it("형식이 아니면 조회조차 하지 않는다", async () => {
    const result = await service.verifyPassToken(admin, "아무 글자", NOW);
    expect(result.verdict).toBe("UNKNOWN");
    expect(findPassForVerify).not.toHaveBeenCalled();
  });

  it("사유·행선지는 pass:read:any를 가진 검증자에게만 실린다", async () => {
    findPassForVerify.mockResolvedValue(stored());

    const byAdmin = await service.verifyPassToken(admin, tokenFor(), NOW);
    expect(byAdmin.detailed).toBe(true);
    expect(byAdmin.pass?.destination).toBe("치과");
    expect(byAdmin.pass?.reason).toBe("정기 검진");

    const byStudent = await service.verifyPassToken(student, tokenFor(), NOW);
    expect(byStudent.detailed).toBe(false);
    expect(byStudent.pass?.destination).toBeNull();
    expect(byStudent.pass?.reason).toBeNull();
  });

  it("학부모도 판정할 수 있다", async () => {
    findPassForVerify.mockResolvedValue(stored());
    const result = await service.verifyPassToken(parent, tokenFor(), NOW);
    expect(result.verdict).toBe("VALID");
    expect(result.detailed).toBe(false);
  });

  it("로그인하지 않았으면 애초에 여기 못 온다 — 권한 없는 역할은 ForbiddenError", async () => {
    const noRole = { ...student, role: null };
    await expect(service.verifyPassToken(noRole, tokenFor(), NOW)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("판정은 아무것도 쓰지 않는다", async () => {
    findPassForVerify.mockResolvedValue(stored());
    await service.verifyPassToken(admin, tokenFor(), NOW);
    expect(transition).not.toHaveBeenCalled();
    expect(createPass).not.toHaveBeenCalled();
    // 거부가 아니면 감사로그도 남지 않는다 (판정은 읽기다)
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("재적이 없으면 학번은 null이다 — 판정 자체는 그대로 나온다", async () => {
    findPassForVerify.mockResolvedValue(
      stored({
        studentProfile: {
          id: "sp-1",
          user: { id: "u-1", name: "김민준", role: "STUDENT" },
          enrollments: [],
        },
      }),
    );
    const result = await service.verifyPassToken(admin, tokenFor(), NOW);
    expect(result.verdict).toBe("VALID");
    expect(result.pass?.studentNumber).toBeNull();
  });
});
