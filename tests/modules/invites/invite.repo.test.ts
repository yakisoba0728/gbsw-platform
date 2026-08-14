import { beforeEach, describe, expect, it, vi } from "vitest";

const studentProfileFindMany = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: {
    studentProfile: { findMany: studentProfileFindMany },
  },
}));

const { listStudents } = await import("@/modules/invites/invite.repo");

beforeEach(() => {
  studentProfileFindMany.mockReset().mockResolvedValue([]);
});

describe("listStudents()", () => {
  it("명단에서 빠져 소프트 삭제된 학생은 뺀다 — 더는 재적 학생이 아니라 학부모 " +
    "코드 발급 대상으로 고를 수 없어야 한다", async () => {
    await listStudents(2026);

    expect(studentProfileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: { deletedAt: null } } }),
    );
  });
});
