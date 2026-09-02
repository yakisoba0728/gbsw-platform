import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";

const countUsers = vi.fn();
const createAdminUser = vi.fn();
const {
  recordAudit,
  txClient,
  bareWithTransaction: withTransaction,
} = coreMocks("bootstrap-service-test");

vi.mock("@/modules/bootstrap/bootstrap.repo", () => ({
  countUsers,
  createAdminUser,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const {
  canShowBootstrapForm,
  createInitialAdmin,
  issueBootstrapTokenIfNeeded,
} = await import("@/modules/bootstrap/bootstrap.service");

const { clearToken, matchesToken } = await import(
  "@/modules/bootstrap/bootstrap.token"
);

const input = {
  name: "홍길동",
  email: "admin@gbsw.hs.kr",
  phone: "010-1234-5678",
  password: "correct-horse-battery",
  confirmPassword: "correct-horse-battery",
};

/** 사용자 0명 상태로 만들고 토큰을 발급받는다. */
async function issueForEmptyDb(): Promise<string> {
  countUsers.mockResolvedValue(0);
  const token = await issueBootstrapTokenIfNeeded();
  if (!token) throw new Error("토큰이 발급되지 않았습니다");
  return token;
}

describe("issueBootstrapTokenIfNeeded()", () => {
  beforeEach(() => {
    clearToken();
    countUsers.mockReset();
    createAdminUser.mockReset().mockResolvedValue(undefined);
    recordAudit.mockReset();
    withTransaction.mockReset().mockImplementation(async (fn) => fn(txClient));
  });

  it("사용자가 없으면 토큰을 발급한다", async () => {
    const token = await issueForEmptyDb();
    expect(matchesToken(token)).toBe(true);
  });

  it("사용자가 있으면 발급하지 않고 기존 토큰도 없앤다", async () => {
    const stale = await issueForEmptyDb();

    countUsers.mockResolvedValue(1);
    const token = await issueBootstrapTokenIfNeeded();

    expect(token).toBeNull();
    expect(matchesToken(stale)).toBe(false);
  });
});

describe("canShowBootstrapForm()", () => {
  beforeEach(() => {
    clearToken();
    countUsers.mockReset();
  });

  it("토큰이 없으면 거부한다", async () => {
    countUsers.mockResolvedValue(0);
    expect(await canShowBootstrapForm(undefined)).toBe(false);
  });

  it("틀린 토큰이면 거부한다", async () => {
    await issueForEmptyDb();
    expect(await canShowBootstrapForm("위조된-토큰")).toBe(false);
  });

  it("토큰이 맞아도 사용자가 이미 있으면 거부한다", async () => {
    const token = await issueForEmptyDb();

    countUsers.mockResolvedValue(1);

    expect(await canShowBootstrapForm(token)).toBe(false);
  });

  it("두 조건이 모두 맞으면 허용하고, 토큰을 소진하지는 않는다", async () => {
    const token = await issueForEmptyDb();

    expect(await canShowBootstrapForm(token)).toBe(true);
    // 화면을 두 번 열어도 여전히 유효해야 한다.
    expect(await canShowBootstrapForm(token)).toBe(true);
  });
});

describe("createInitialAdmin()", () => {
  beforeEach(() => {
    clearToken();
    countUsers.mockReset();
    createAdminUser.mockReset().mockResolvedValue(undefined);
    recordAudit.mockReset();
    withTransaction.mockReset().mockImplementation(async (fn) => fn(txClient));
  });

  it("사용자가 이미 있으면 아무것도 만들지 않는다", async () => {
    const token = await issueForEmptyDb();
    countUsers.mockResolvedValue(1);

    await expect(createInitialAdmin(token, input)).rejects.toThrow();

    expect(createAdminUser).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    // 더 이상 필요 없으므로 토큰도 회수된다.
    expect(matchesToken(token)).toBe(false);
  });

  it("토큰이 틀리면 repo를 건드리지 않는다", async () => {
    const token = await issueForEmptyDb();

    await expect(createInitialAdmin("위조된-토큰", input)).rejects.toThrow();

    expect(createAdminUser).not.toHaveBeenCalled();
    // 진짜 토큰은 살아 있어야 한다.
    expect(matchesToken(token)).toBe(true);
  });

  it("ADMIN을 만들고 감사로그를 남긴다", async () => {
    const token = await issueForEmptyDb();

    await createInitialAdmin(token, input);

    expect(createAdminUser).toHaveBeenCalledTimes(1);
    const created = createAdminUser.mock.calls[0]![0];
    expect(created.name).toBe("홍길동");
    expect(created.email).toBe("admin@gbsw.hs.kr");
    // 전화번호는 필수다 — 최초 관리자만 예외로 두면 번호 없는 교사 계정이 남는다.
    expect(created.phone).toBe("010-1234-5678");
    // 평문 비밀번호가 저장 경로로 새어나가면 안 된다.
    expect(created.passwordHash).not.toBe(input.password);
    expect(created.passwordHash.length).toBeGreaterThan(20);
    expect(createAdminUser.mock.calls[0]![1]).toBe(txClient);

    expect(recordAudit).toHaveBeenCalledWith({
      actorUserId: created.userId,
      action: "account:bootstrap",
      targetType: "User",
      targetId: created.userId,
    }, txClient);
  });

  it("성공하면 토큰이 소진되어 재사용할 수 없다", async () => {
    const token = await issueForEmptyDb();

    await createInitialAdmin(token, input);

    expect(matchesToken(token)).toBe(false);
  });

  it("계정 생성이 실패하면 토큰을 되돌린다", async () => {
    const token = await issueForEmptyDb();
    createAdminUser.mockRejectedValue(new Error("DB 오류"));

    await expect(createInitialAdmin(token, input)).rejects.toThrow("DB 오류");

    // 아직 관리자가 없으므로 다시 시도할 수 있어야 한다.
    expect(matchesToken(token)).toBe(true);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("감사 생성이 실패하면 토큰을 되돌린다", async () => {
    const token = await issueForEmptyDb();
    recordAudit.mockRejectedValue(new Error("audit failed"));

    await expect(createInitialAdmin(token, input)).rejects.toThrow("audit failed");

    expect(createAdminUser).toHaveBeenCalledOnce();
    // 사용자·감사가 같은 트랜잭션이므로 실패 후 다시 시도할 수 있어야 한다.
    expect(matchesToken(token)).toBe(true);
  });
});
