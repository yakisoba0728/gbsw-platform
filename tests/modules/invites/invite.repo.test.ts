import { beforeEach, describe, expect, it, vi } from "vitest";

const studentProfileFindMany = vi.fn();
const inviteCount = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: {
    studentProfile: { findMany: studentProfileFindMany },
    invite: { count: inviteCount },
  },
}));

const { countActiveByStudent, listStudents } = await import(
  "@/modules/invites/invite.repo"
);

beforeEach(() => {
  studentProfileFindMany.mockReset().mockResolvedValue([]);
  inviteCount.mockReset().mockResolvedValue(0);
});

describe("listStudents()", () => {
  it("명단에서 빠진 학생은 학부모 코드 발급 대상에서 뺀다", async () => {
    await listStudents(2026);

    expect(studentProfileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: { deletedAt: null } } }),
    );
  });
});

describe("countActiveByStudent()", () => {
  it("만료된 PENDING 코드는 한도에 세지 않는다", async () => {
    const now = new Date("2026-08-16T00:00:00+09:00");

    await countActiveByStudent("sp-1", now);

    expect(inviteCount).toHaveBeenCalledWith({
      where: {
        studentId: "sp-1",
        status: "PENDING",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
  });

  it("만료가 없는 코드(무기한)는 센다", async () => {
    await countActiveByStudent("sp-1", new Date());

    const where = inviteCount.mock.calls[0]![0].where as {
      OR: { expiresAt: unknown }[];
    };
    expect(where.OR).toContainEqual({ expiresAt: null });
  });
});
