import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

const listCommunities = vi.fn();
const listAllCommunities = vi.fn();
const findCommunityBySlug = vi.fn();
const findCommunity = vi.fn();
const createCommunity = vi.fn();
const updateCommunity = vi.fn();
const markCommunityDeleted = vi.fn();
const {
  recordAudit,
  txClient,
  prewiredWithTransaction: withTransaction,
} = coreMocks("board-service-test");

vi.mock("@/modules/community/community.repo", () => ({
  listCommunities,
  listAllCommunities,
  findCommunityBySlug,
  findCommunity,
  createCommunity,
  updateCommunity,
  markCommunityDeleted,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { CommunityError } = await import("@/modules/community/community.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/community/board.service");

const admin = user("ADMIN", "admin-1");
const student = user("STUDENT", "s-1");
const parent = user("PARENT", "p-1");

const input = {
  slug: "notice",
  name: "공지사항",
  description: null,
  // 서비스는 zod를 통과한 타입을 받으므로 역할도 좁은 리터럴이다.
  readRoles: ["STUDENT", "PARENT"] as ("STUDENT" | "PARENT")[],
  writeRoles: [] as ("STUDENT" | "PARENT")[],
  anonymous: false,
  allowAttachments: true,
  sortOrder: 0,
};

function board(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    slug: "notice",
    name: "공지사항",
    description: null,
    readRoles: ["STUDENT", "PARENT"],
    writeRoles: ["STUDENT"],
    anonymous: false,
    allowAttachments: true,
    sortOrder: 0,
    active: true,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createCommunity.mockResolvedValue({ id: "c1" });
  updateCommunity.mockResolvedValue(true);
  markCommunityDeleted.mockResolvedValue(1);
});

describe("createCommunity", () => {
  it("교사는 만든다 — 감사로그를 트랜잭션 안에서 남긴다", async () => {
    await service.createCommunity(admin, input);

    expect(createCommunity).toHaveBeenCalledWith(input, txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin-1",
        action: "community:create",
        targetType: "Community",
        targetId: "c1",
        metadata: expect.objectContaining({ slug: "notice", anonymous: false }),
      }),
      txClient,
    );
  });

  it.each([
    ["학생", student],
    ["학부모", parent],
  ])("%s는 거부한다", async (_label, actor) => {
    await expect(service.createCommunity(actor, input)).rejects.toThrow(ForbiddenError);
    expect(createCommunity).not.toHaveBeenCalled();
  });

  it("같은 주소가 있으면 SLUG_TAKEN", async () => {
    createCommunity.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    await expect(service.createCommunity(admin, input)).rejects.toThrow(
      new CommunityError("SLUG_TAKEN"),
    );
  });
});

describe("updateCommunity", () => {
  const patch = {
    communityId: "c1",
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    name: "공지",
    description: null,
    readRoles: ["STUDENT"] as ("STUDENT" | "PARENT")[],
    writeRoles: [] as ("STUDENT" | "PARENT")[],
    anonymous: false,
    allowAttachments: true,
    sortOrder: 1,
  };

  it("교사는 고친다 — 권한 전후를 감사로그에 남긴다", async () => {
    findCommunity.mockResolvedValue(board());

    await service.updateCommunity(admin, patch);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:update",
        targetId: "c1",
        metadata: expect.objectContaining({
          readRolesFrom: ["STUDENT", "PARENT"],
          readRolesTo: ["STUDENT"],
          writeRolesFrom: ["STUDENT"],
          writeRolesTo: [],
        }),
      }),
      txClient,
    );
  });

  it("바뀐 것이 없으면 쓰지도 기록하지도 않는다", async () => {
    findCommunity.mockResolvedValue(board());

    await service.updateCommunity(admin, {
      ...patch,
      name: "공지사항",
      sortOrder: 0,
      readRoles: ["PARENT", "STUDENT"] as ("STUDENT" | "PARENT")[], // 순서만 다르다
      writeRoles: ["STUDENT"] as ("STUDENT" | "PARENT")[],
    });

    expect(updateCommunity).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("없는 게시판이면 COMMUNITY_NOT_FOUND", async () => {
    findCommunity.mockResolvedValue(null);
    await expect(service.updateCommunity(admin, patch)).rejects.toThrow(
      new CommunityError("COMMUNITY_NOT_FOUND"),
    );
  });

  it("그 사이 누가 바꿨으면 COMMUNITY_CONFLICT", async () => {
    findCommunity.mockResolvedValue(board());
    updateCommunity.mockResolvedValue(false);
    await expect(service.updateCommunity(admin, patch)).rejects.toThrow(
      new CommunityError("COMMUNITY_CONFLICT"),
    );
  });

  it("**익명을 끄면 거부한다** — 쌓인 글의 작성자가 전부 드러난다", async () => {
    findCommunity.mockResolvedValue(board({ anonymous: true }));

    await expect(
      service.updateCommunity(admin, { ...patch, anonymous: false }),
    ).rejects.toThrow(new CommunityError("ANONYMOUS_IRREVERSIBLE"));
    expect(updateCommunity).not.toHaveBeenCalled();
  });

  it("익명을 켜는 것은 된다 — 이름이 더 감춰질 뿐이다", async () => {
    findCommunity.mockResolvedValue(board({ anonymous: false }));

    await service.updateCommunity(admin, { ...patch, anonymous: true });

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ anonymousFrom: false, anonymousTo: true }),
      }),
      txClient,
    );
  });

  it("익명이 이미 켜진 채로 두면 통과한다", async () => {
    findCommunity.mockResolvedValue(board({ anonymous: true, name: "옛이름" }));
    await expect(
      service.updateCommunity(admin, { ...patch, anonymous: true }),
    ).resolves.toBeUndefined();
  });

  it("학생은 거부한다", async () => {
    await expect(service.updateCommunity(student, patch)).rejects.toThrow(ForbiddenError);
  });
});

describe("deleteCommunity", () => {
  const del = {
    communityId: "c1",
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    reason: "학기가 끝났습니다",
  };

  it("교사는 없앤다 — 사유를 감사로그에 남긴다", async () => {
    findCommunity.mockResolvedValue(board());

    await service.deleteCommunity(admin, del);

    expect(markCommunityDeleted).toHaveBeenCalledWith("c1", del.updatedAt, txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:delete",
        metadata: expect.objectContaining({
          slug: "notice",
          reason: "학기가 끝났습니다",
        }),
      }),
      txClient,
    );
  });

  it("이미 없앤 게시판이면 아무것도 하지 않는다 — 감사로그가 두 줄 쌓이지 않게", async () => {
    findCommunity.mockResolvedValue(board({ active: false }));

    await service.deleteCommunity(admin, del);

    expect(markCommunityDeleted).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("그 사이 누가 바꿨으면 COMMUNITY_CONFLICT", async () => {
    findCommunity.mockResolvedValue(board());
    markCommunityDeleted.mockResolvedValue(0);
    await expect(service.deleteCommunity(admin, del)).rejects.toThrow(
      new CommunityError("COMMUNITY_CONFLICT"),
    );
  });

  it("학생은 거부한다", async () => {
    await expect(service.deleteCommunity(student, del)).rejects.toThrow(ForbiddenError);
  });
});

describe("listForManage", () => {
  it("교사는 없앤 것까지 본다", async () => {
    listAllCommunities.mockResolvedValue([board(), board({ id: "c2", active: false })]);
    expect((await service.listForManage(admin)).map((r) => r.id)).toEqual(["c1", "c2"]);
  });

  it("학생은 거부한다", async () => {
    await expect(service.listForManage(student)).rejects.toThrow(ForbiddenError);
  });
});

describe("listReadable", () => {
  it("읽을 수 있는 게시판만 준다", async () => {
    listCommunities.mockResolvedValue([
      board({ id: "a", readRoles: ["STUDENT"] }),
      board({ id: "b", readRoles: ["PARENT"] }),
      board({ id: "c", readRoles: [] }),
    ]);

    const rows = await service.listReadable(student);

    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("교사는 전부 본다 — 읽기 역할이 비어 있어도", async () => {
    listCommunities.mockResolvedValue([board({ id: "c", readRoles: [] })]);
    expect((await service.listReadable(admin)).map((r) => r.id)).toEqual(["c"]);
  });
});

describe("getReadableBySlug", () => {
  it("읽을 수 있으면 준다", async () => {
    findCommunityBySlug.mockResolvedValue(board());
    await expect(service.getReadableBySlug(student, "notice")).resolves.toMatchObject({
      id: "c1",
    });
  });

  it("못 읽으면 ForbiddenError + 거부 감사로그", async () => {
    findCommunityBySlug.mockResolvedValue(board({ readRoles: ["PARENT"] }));

    await expect(service.getReadableBySlug(student, "notice")).rejects.toThrow(
      ForbiddenError,
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "authz:denied" }),
    );
  });

  it("없앤 게시판은 COMMUNITY_NOT_FOUND — 읽을 수 있어도", async () => {
    findCommunityBySlug.mockResolvedValue(board({ active: false }));
    await expect(service.getReadableBySlug(student, "notice")).rejects.toThrow(
      new CommunityError("COMMUNITY_NOT_FOUND"),
    );
  });

  it("교사에게도 없앤 게시판은 COMMUNITY_NOT_FOUND", async () => {
    findCommunityBySlug.mockResolvedValue(board({ active: false }));
    await expect(service.getReadableBySlug(admin, "notice")).rejects.toThrow(
      new CommunityError("COMMUNITY_NOT_FOUND"),
    );
  });

  it("없는 주소면 COMMUNITY_NOT_FOUND", async () => {
    findCommunityBySlug.mockResolvedValue(null);
    await expect(service.getReadableBySlug(admin, "nope")).rejects.toThrow(
      new CommunityError("COMMUNITY_NOT_FOUND"),
    );
  });
});

describe("getWritableBySlug", () => {
  it("쓸 수 있으면 준다", async () => {
    findCommunityBySlug.mockResolvedValue(board());
    await expect(service.getWritableBySlug(student, "notice")).resolves.toMatchObject({
      id: "c1",
    });
  });

  it("읽을 수는 있어도 못 쓰면 거부한다", async () => {
    findCommunityBySlug.mockResolvedValue(board({ writeRoles: [] }));
    await expect(service.getWritableBySlug(student, "notice")).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("교사는 쓰기 역할이 비어 있어도 쓴다", async () => {
    findCommunityBySlug.mockResolvedValue(board({ writeRoles: [] }));
    await expect(service.getWritableBySlug(admin, "notice")).resolves.toMatchObject({
      id: "c1",
    });
  });
});
