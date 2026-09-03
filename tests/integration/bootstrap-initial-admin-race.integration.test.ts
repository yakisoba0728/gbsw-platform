import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";
import { BOOTSTRAP_LOCK_KEY } from "@/modules/bootstrap/bootstrap.repo";
import { createInitialAdmin } from "@/modules/bootstrap/bootstrap.service";
import {
  clearToken,
  issueToken,
  matchesToken,
} from "@/modules/bootstrap/bootstrap.token";

vi.mock("server-only", () => ({}));

const EMAILS = [
  "itest-bootstrap-race-a@example.invalid",
  "itest-bootstrap-race-b@example.invalid",
];

// pg_locks는 bigint 키를 상위·하위 32비트로 나눠 보여 준다.
const UNSIGNED_KEY = BigInt.asUintN(64, BOOTSTRAP_LOCK_KEY);
const LOCK_CLASSID = Number(UNSIGNED_KEY >> BigInt(32));
const LOCK_OBJID = Number(UNSIGNED_KEY & BigInt(0xffffffff));

let blocker: Client | null = null;

function adminInput(index: number) {
  const password = `bootstrap-race-secret-${index}`;
  return {
    name: `최초교사${index}`,
    email: EMAILS[index]!,
    phone: `010-9900-000${index}`,
    password,
    confirmPassword: password,
  };
}

/** 두 요청이 잠금 앞에 함께 줄을 서도록 밖에서 먼저 잠가 둔다. */
async function holdBootstrapLock(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  blocker = client;
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [
    BOOTSTRAP_LOCK_KEY.toString(),
  ]);
}

async function releaseBootstrapLock(): Promise<void> {
  const client = blocker;
  if (!client) return;
  blocker = null;
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end().catch(() => undefined);
}

async function countBootstrapLocks(onlyWaiting: boolean): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n
    FROM pg_locks
    WHERE locktype = 'advisory'
      AND classid::int8 = ${LOCK_CLASSID}
      AND objid::int8 = ${LOCK_OBJID}
      AND objsubid = 1
      AND (NOT ${onlyWaiting} OR NOT granted)
  `;
  return Number(rows[0]!.n);
}

type Settled = { ok: true; error: null } | { ok: false; error: unknown };

/** 결과를 나중에 읽으므로 실패 처리는 만드는 즉시 붙인다. */
function settle(promise: Promise<void>): Promise<Settled> {
  return promise.then(
    (): Settled => ({ ok: true, error: null }),
    (error: unknown): Settled => ({ ok: false, error }),
  );
}

async function waitFor(
  ready: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ready()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

afterEach(async () => {
  await releaseBootstrapLock();
  clearToken();
  await prisma.auditLog.deleteMany({ where: { action: "account:bootstrap" } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
});

describe("최초 관리자 생성 경합", () => {
  it("두 요청이 동시에 들어와도 관리자는 한 명만 만들어진다", async () => {
    expect(
      await prisma.user.count(),
      "테스트 DB에 사용자가 남아 있습니다 — 다른 통합 테스트와 겹쳐 돌리지 않았는지 확인하세요",
    ).toBe(0);

    await holdBootstrapLock();

    // 인스턴스가 둘이면 콘솔 토큰도 둘이라 메모리 게이트가 둘을 가르지 못한다.
    // 한 프로세스에서 그 상황을 만들려고 토큰을 두 번 발급한다.
    const firstToken = issueToken();
    const first = settle(createInitialAdmin(firstToken, adminInput(0)));
    await waitFor(() => !matchesToken(firstToken), 3_000);

    const secondToken = issueToken();
    const second = settle(createInitialAdmin(secondToken, adminInput(1)));

    // 둘 다 잠금 앞에 선 것을 보고 푼다. 못 세워도 그대로 진행해
    // 「한 명만 만들어졌는가」가 결과를 말하게 한다.
    await waitFor(async () => (await countBootstrapLocks(true)) >= 2, 2_500);
    await releaseBootstrapLock();

    const results = await Promise.all([first, second]);
    const failures = results.filter((result) => !result.ok);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.error).toMatchObject({ message: "ALREADY_INITIALIZED" });

    const admins = await prisma.user.findMany({
      select: { email: true, role: true },
    });
    expect(admins).toHaveLength(1);
    expect(admins[0]!.role).toBe("ADMIN");
    expect(EMAILS).toContain(admins[0]!.email);

    expect(
      await prisma.auditLog.count({ where: { action: "account:bootstrap" } }),
    ).toBe(1);

    // 트랜잭션이 끝나면 저절로 풀리는 잠금이라 아무도 들고 있지 않아야 한다.
    expect(await countBootstrapLocks(false)).toBe(0);
  });

  it("잠금을 기다리는 동안 관리자가 생기면 만들지 않고 토큰도 되살리지 않는다", async () => {
    expect(
      await prisma.user.count(),
      "테스트 DB에 사용자가 남아 있습니다 — 다른 통합 테스트와 겹쳐 돌리지 않았는지 확인하세요",
    ).toBe(0);

    await holdBootstrapLock();

    const token = issueToken();
    const attempt = settle(createInitialAdmin(token, adminInput(1)));
    // 트랜잭션 밖 확인은 0명일 때 이미 통과했다.
    await waitFor(() => !matchesToken(token), 3_000);
    await waitFor(async () => (await countBootstrapLocks(true)) >= 1, 2_500);

    // 다른 인스턴스가 먼저 만든 상황.
    await prisma.user.create({
      data: {
        id: randomUUID(),
        name: "먼저만든교사",
        email: EMAILS[0]!,
        phone: "010-9900-0009",
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    await releaseBootstrapLock();

    const result = await attempt;
    expect(result.error).toMatchObject({ message: "ALREADY_INITIALIZED" });
    expect(matchesToken(token)).toBe(false);
    expect(await prisma.user.count()).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { action: "account:bootstrap" } }),
    ).toBe(0);
  });
});
