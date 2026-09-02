import { describe, expect, it, vi } from "vitest";
import { assertDemoSeedAllowed, cleanUp } from "../../scripts/seed-demo";

const LOCAL_DB = "postgresql://gbsw:gbsw@localhost:5433/gbsw";

describe("assertDemoSeedAllowed()", () => {
  it("명시적 확인 없이는 실행하지 않는다", () => {
    expect(() =>
      assertDemoSeedAllowed({ argv: ["node", "seed-demo.ts"], env: { DATABASE_URL: LOCAL_DB } }),
    ).toThrow("명시적 확인");
  });

  it("운영 환경에서는 확인 플래그가 있어도 실행하지 않는다", () => {
    expect(() =>
      assertDemoSeedAllowed({
        argv: ["node", "seed-demo.ts", "--yes-local-demo-db"],
        env: { DATABASE_URL: LOCAL_DB, NODE_ENV: "production" },
      }),
    ).toThrow("운영 환경");
  });

  it("원격 DB URL은 실행하지 않는다", () => {
    expect(() =>
      assertDemoSeedAllowed({
        argv: ["node", "seed-demo.ts", "--yes-local-demo-db"],
        env: { DATABASE_URL: "postgresql://gbsw:secret@db.example.com:5432/gbsw" },
      }),
    ).toThrow("localhost");
  });

  it("확인 플래그와 로컬 DB면 통과한다", () => {
    expect(() =>
      assertDemoSeedAllowed({
        argv: ["node", "seed-demo.ts", "--yes-local-demo-db"],
        env: { DATABASE_URL: LOCAL_DB },
      }),
    ).not.toThrow();
  });

  it("IPv6 루프백 DB URL도 로컬로 본다", () => {
    expect(() =>
      assertDemoSeedAllowed({
        argv: ["node", "seed-demo.ts", "--yes-local-demo-db"],
        env: { DATABASE_URL: "postgresql://gbsw:gbsw@[::1]:5433/gbsw" },
      }),
    ).not.toThrow();
  });
});

describe("cleanUp()", () => {
  it("시연 계정이 만든 초대도 계정을 지우기 전에 정리한다", async () => {
    const inviteDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "teacher-1", email: "teacher@demo.invalid" }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      studentProfile: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      meritAward: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      enrollment: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      parentStudent: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      invite: { deleteMany: inviteDeleteMany },
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await cleanUp(prisma as never);

    expect(inviteDeleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { createdById: { in: ["teacher-1"] } },
          { usedById: { in: ["teacher-1"] } },
          { studentId: { in: [] } },
        ],
      },
    });
    log.mockRestore();
  });
});
