import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/db/client", () => ({
  prisma: {},
  withTransaction: vi.fn(),
}));

const repo = await import("@/modules/pass/pass.repo");

const queryRaw = vi.fn();

beforeEach(() => {
  queryRaw.mockReset();
});

function sqlAt(index: number): string {
  return queryRaw.mock.calls[index]![0].join(" ");
}

describe("출입증 생성 잠금 순서", () => {
  it("학생 신청은 User를 먼저 잠그고 StudentProfile을 잠근다", async () => {
    queryRaw
      .mockResolvedValueOnce([{ id: "u-1" }])
      .mockResolvedValueOnce([{ id: "sp-1" }]);

    await expect(
      repo.lockStudentForPassCreation("sp-1", { $queryRaw: queryRaw } as never),
    ).resolves.toBe(true);

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(sqlAt(0)).toContain('FROM "user"');
    expect(sqlAt(1)).toContain('FROM "StudentProfile"');
  });

  it("직접 부여는 User → StudentProfile → Enrollment 순으로 잠그고 학생 역할도 확인한다", async () => {
    queryRaw
      .mockResolvedValueOnce([{ id: "u-1" }])
      .mockResolvedValueOnce([{ id: "sp-1" }])
      .mockResolvedValueOnce([{ id: "e-1" }]);

    await expect(
      repo.lockEligibleStudentForPassCreation(
        "sp-1",
        2026,
        { $queryRaw: queryRaw } as never,
      ),
    ).resolves.toBe(true);

    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(sqlAt(0)).toContain('FROM "user"');
    expect(sqlAt(0)).toContain('"role" = \'STUDENT\'');
    expect(sqlAt(1)).toContain('FROM "StudentProfile"');
    expect(sqlAt(2)).toContain('FROM "Enrollment"');
  });
});
