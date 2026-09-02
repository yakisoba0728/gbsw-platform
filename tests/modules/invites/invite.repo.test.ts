import { beforeEach, describe, expect, it, vi } from "vitest";

const studentProfileFindMany = vi.fn();
const inviteCount = vi.fn();
const inviteCreate = vi.fn();
const inviteFindMany = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: {
    studentProfile: { findMany: studentProfileFindMany },
    invite: { count: inviteCount, create: inviteCreate, findMany: inviteFindMany },
    $queryRaw: queryRaw,
  },
}));

const {
  countActiveByStudent,
  insertInvite,
  listByStudent,
  listStudents,
  lockStudentForParentInvite,
} = await import("@/modules/invites/invite.repo");

beforeEach(() => {
  studentProfileFindMany.mockReset().mockResolvedValue([]);
  inviteCount.mockReset().mockResolvedValue(0);
  inviteCreate.mockReset().mockResolvedValue({ id: "inv-1" });
  inviteFindMany.mockReset().mockResolvedValue([]);
  queryRaw.mockReset().mockResolvedValue([{ id: "sp-1" }]);
});

describe("insertInvite()", () => {
  it("발급자 id와 이름 스냅샷을 함께 저장한다", async () => {
    await insertInvite({
      code: "ABCD2345",
      role: "ADMIN",
      metadata: { name: "신규 교사" },
      expiresAt: null,
      createdById: "admin-1",
      createdByName: "관리자",
    });

    expect(inviteCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: "admin-1",
        createdByName: "관리자",
      }),
    });
  });
});

describe("listByStudent()", () => {
  it("학생에게 귀속된 학부모 코드는 발급자를 가리지 않고 모두 보여준다", async () => {
    await listByStudent("sp-1");

    expect(inviteFindMany).toHaveBeenCalledWith({
      where: { studentId: "sp-1", role: "PARENT" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    expect(inviteFindMany.mock.calls[0]![0].where).not.toHaveProperty(
      "createdById",
    );
  });
});

describe("lockStudentForParentInvite()", () => {
  it("User 다음 StudentProfile 순으로 잠그고 존재 여부를 반환한다", async () => {
    const tx = {
      $queryRaw: queryRaw,
    };

    await expect(
      lockStudentForParentInvite("sp-1", tx as never),
    ).resolves.toBe(true);

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(queryRaw.mock.calls[0]![0].join(" ")).toContain('FROM "user"');
    expect(queryRaw.mock.calls[1]![0].join(" ")).toContain('FROM "StudentProfile"');
  });

  it("잠글 학생이 없으면 false다", async () => {
    queryRaw.mockResolvedValue([]);

    await expect(
      lockStudentForParentInvite("missing", { $queryRaw: queryRaw } as never),
    ).resolves.toBe(false);
  });
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
