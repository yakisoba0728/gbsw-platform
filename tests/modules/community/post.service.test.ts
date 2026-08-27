import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const countPosts = vi.fn();
const listPosts = vi.fn();
const findPost = vi.fn();
const createPost = vi.fn();
const updatePost = vi.fn();
const markPostDeleted = vi.fn();
const attachToPost = vi.fn();
const detachFromPost = vi.fn();
const listAttachments = vi.fn();
const getReadableBySlug = vi.fn();
const getWritableBySlug = vi.fn();
const deleteAttachment = vi.fn();
const recordAudit = vi.fn();
const txClient = { tx: "post-service-test" };
const withTransaction = vi.fn(
  async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
);

vi.mock("@/modules/community/community.repo", () => ({
  countPosts,
  listPosts,
  findPost,
  createPost,
  updatePost,
  markPostDeleted,
  attachToPost,
  detachFromPost,
  listAttachments,
}));
vi.mock("@/modules/community/board.service", () => ({
  getReadableBySlug,
  getWritableBySlug,
}));
vi.mock("@/modules/community/community.storage", () => ({ deleteAttachment }));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { CommunityError } = await import("@/modules/community/community.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/community/post.service");

function user(role: SessionUser["role"], id: string, name = "김민준"): SessionUser {
  return {
    id,
    name,
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const student = user("STUDENT", "s-1");
const other = user("STUDENT", "s-2", "박도현");
const admin = user("ADMIN", "a-1", "이정민");

function board(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    slug: "free",
    name: "자유게시판",
    description: null,
    anonymous: false,
    allowAttachments: true,
    active: true,
    readRoles: ["STUDENT"],
    writeRoles: ["STUDENT"],
    ...over,
  };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    communityId: "c1",
    title: "제목",
    body: "본문",
    authorUserId: "s-1" as string | null,
    authorName: "김민준",
    authorRole: "STUDENT",
    deletedAt: null as Date | null,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    _count: { comments: 2 },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getReadableBySlug.mockResolvedValue(board());
  getWritableBySlug.mockResolvedValue(board());
  createPost.mockResolvedValue({ id: "p1" });
  updatePost.mockResolvedValue(true);
  markPostDeleted.mockResolvedValue(1);
  attachToPost.mockResolvedValue(0);
  detachFromPost.mockResolvedValue([]);
  listAttachments.mockResolvedValue([]);
  deleteAttachment.mockResolvedValue(undefined);
  countPosts.mockResolvedValue(0);
  listPosts.mockResolvedValue([]);
});

describe("createPost", () => {
  const input = { slug: "free", title: "제목", body: "본문", attachmentIds: [] };

  it("쓰기 문을 지나야 쓴다 — 작성자 이름·역할 스냅샷을 함께 넣는다", async () => {
    const result = await service.createPost(student, input);

    expect(getWritableBySlug).toHaveBeenCalledWith(student, "free");
    expect(createPost).toHaveBeenCalledWith(
      {
        communityId: "c1",
        title: "제목",
        body: "본문",
        authorUserId: "s-1",
        authorName: "김민준",
        authorRole: "STUDENT",
      },
      txClient,
    );
    expect(result).toEqual({ postId: "p1", slug: "free" });
  });

  it("익명 게시판도 감사로그를 남긴다 — 예외를 만들지 않는다", async () => {
    getWritableBySlug.mockResolvedValue(board({ anonymous: true }));

    await service.createPost(student, input);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "s-1",
        action: "community:post:create",
        targetId: "p1",
      }),
      txClient,
    );
  });

  it("쓰기 문이 막으면 그대로 올린다", async () => {
    getWritableBySlug.mockRejectedValue(new ForbiddenError("community:write"));
    await expect(service.createPost(other, input)).rejects.toThrow(ForbiddenError);
    expect(createPost).not.toHaveBeenCalled();
  });

  it("첨부를 안 받는 게시판에 첨부를 실으면 거부한다", async () => {
    getWritableBySlug.mockResolvedValue(board({ allowAttachments: false }));
    await expect(
      service.createPost(student, { ...input, attachmentIds: ["a1"] }),
    ).rejects.toThrow(new CommunityError("ATTACHMENT_NOT_ALLOWED"));
    expect(createPost).not.toHaveBeenCalled();
  });

  it("첨부를 글에 붙인다 — 올린 사람이 글쓴이인 것만", async () => {
    attachToPost.mockResolvedValue(2);

    await service.createPost(student, { ...input, attachmentIds: ["a1", "a2"] });

    expect(attachToPost).toHaveBeenCalledWith(["a1", "a2"], "p1", "s-1", txClient);
  });

  it("남의 첨부라 하나도 안 붙으면 ATTACHMENT_NOT_FOUND", async () => {
    attachToPost.mockResolvedValue(0);
    await expect(
      service.createPost(student, { ...input, attachmentIds: ["stolen"] }),
    ).rejects.toThrow(new CommunityError("ATTACHMENT_NOT_FOUND"));
  });
});

describe("getPost", () => {
  it("읽기 문을 지나면 뷰를 준다", async () => {
    findPost.mockResolvedValue({ ...row(), community: board() });

    const view = await service.getPost(other, "p1");

    expect(getReadableBySlug).toHaveBeenCalledWith(other, "free");
    expect(view.post.author?.display).toBe("김민준님");
    expect(view.post.canEdit).toBe(false);
    expect(view.canWrite).toBe(true);
  });

  it("익명 게시판이면 작성자가 없다", async () => {
    // 서비스는 조인된 post.community가 아니라 getReadableBySlug가 돌려준 것을
    // 쓴다 — 권한을 판정한 그 행이 곧 뷰가 보는 행이어야 한다. 둘을 함께 세운다.
    findPost.mockResolvedValue({ ...row(), community: board({ anonymous: true }) });
    getReadableBySlug.mockResolvedValue(board({ anonymous: true }));

    const view = await service.getPost(admin, "p1");

    expect(view.post.author).toBeNull();
    expect(JSON.stringify(view)).not.toContain("김민준");
  });

  it("읽기만 되는 게시판이면 canWrite가 false다", async () => {
    findPost.mockResolvedValue({ ...row(), community: board({ writeRoles: [] }) });
    getReadableBySlug.mockResolvedValue(board({ writeRoles: [] }));

    expect((await service.getPost(other, "p1")).canWrite).toBe(false);
  });

  it("없는 글이면 POST_NOT_FOUND", async () => {
    findPost.mockResolvedValue(null);
    await expect(service.getPost(other, "p1")).rejects.toThrow(
      new CommunityError("POST_NOT_FOUND"),
    );
  });

  it("지워진 글이면 POST_NOT_FOUND — 교사에게도", async () => {
    findPost.mockResolvedValue({
      ...row({ deletedAt: new Date() }),
      community: board(),
    });
    await expect(service.getPost(admin, "p1")).rejects.toThrow(
      new CommunityError("POST_NOT_FOUND"),
    );
  });
});

describe("updatePost", () => {
  const input = {
    postId: "p1",
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    title: "새 제목",
    body: "새 본문",
    attachmentIds: [],
  };

  beforeEach(() => {
    findPost.mockResolvedValue({ ...row(), community: board() });
  });

  it("본인은 고친다", async () => {
    await service.updatePost(student, input);
    expect(updatePost).toHaveBeenCalledWith(
      "p1",
      { title: "새 제목", body: "새 본문" },
      input.updatedAt,
      txClient,
    );
  });

  it("남은 못 고친다", async () => {
    await expect(service.updatePost(other, input)).rejects.toThrow(ForbiddenError);
    expect(updatePost).not.toHaveBeenCalled();
  });

  it("**교사도 남의 글은 못 고친다** — 조정은 삭제이지 대필이 아니다", async () => {
    await expect(service.updatePost(admin, input)).rejects.toThrow(ForbiddenError);
    expect(updatePost).not.toHaveBeenCalled();
  });

  it("계정이 지워진 글은 본인도 못 고친다", async () => {
    findPost.mockResolvedValue({ ...row({ authorUserId: null }), community: board() });
    await expect(service.updatePost(student, input)).rejects.toThrow(ForbiddenError);
  });

  it("그 사이 바뀌었으면 POST_CONFLICT", async () => {
    updatePost.mockResolvedValue(false);
    await expect(service.updatePost(student, input)).rejects.toThrow(
      new CommunityError("POST_CONFLICT"),
    );
  });

  it("수정에서 뺀 첨부는 커밋 뒤에 디스크에서도 지운다", async () => {
    const createdAt = new Date("2026-08-01T00:00:00.000Z");
    detachFromPost.mockResolvedValue([{ storageKey: "c".repeat(32), createdAt }]);

    await service.updatePost(student, input);

    expect(deleteAttachment).toHaveBeenCalledWith("c".repeat(32), createdAt);
  });

  it("롤백되면 디스크를 안 건드린다", async () => {
    detachFromPost.mockResolvedValue([
      { storageKey: "c".repeat(32), createdAt: new Date() },
    ]);
    updatePost.mockResolvedValue(false);

    await expect(service.updatePost(student, input)).rejects.toThrow(CommunityError);
    expect(deleteAttachment).not.toHaveBeenCalled();
  });
});

describe("deletePost", () => {
  const input = { postId: "p1", reason: "잘못 올렸습니다" };

  beforeEach(() => {
    findPost.mockResolvedValue({ ...row(), community: board() });
  });

  it("본인은 지운다 — byModerator는 false", async () => {
    await service.deletePost(student, input);

    expect(markPostDeleted).toHaveBeenCalledWith(
      "p1",
      "s-1",
      "잘못 올렸습니다",
      txClient,
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:post:delete",
        metadata: expect.objectContaining({ byModerator: false }),
      }),
      txClient,
    );
  });

  it("교사는 남의 글도 지운다 — byModerator는 true", async () => {
    await service.deletePost(admin, input);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ byModerator: true }),
      }),
      txClient,
    );
  });

  it("남은 못 지운다", async () => {
    await expect(service.deletePost(other, input)).rejects.toThrow(ForbiddenError);
  });

  it("이미 지운 글이면 감사로그를 또 남기지 않는다", async () => {
    markPostDeleted.mockResolvedValue(0);
    await service.deletePost(student, input);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("listPostPage", () => {
  it("읽기 문을 지나 한 쪽을 준다", async () => {
    countPosts.mockResolvedValue(45);
    listPosts.mockResolvedValue([row()]);

    const page = await service.listPostPage(other, "free", 2);

    expect(listPosts).toHaveBeenCalledWith("c1", 20, 20);
    expect(page.total).toBe(45);
    expect(page.pageCount).toBe(3);
    expect(page.posts[0].commentCount).toBe(2);
  });

  it("글이 없어도 한 쪽이다 — 페이지 0은 화면에서 표현할 수 없다", async () => {
    const page = await service.listPostPage(other, "free", 1);
    expect(page.pageCount).toBe(1);
    expect(page.posts).toEqual([]);
  });

  it("익명 게시판 목록에도 작성자가 없다", async () => {
    getReadableBySlug.mockResolvedValue(board({ anonymous: true }));
    listPosts.mockResolvedValue([row()]);

    const page = await service.listPostPage(admin, "worry", 1);

    expect(page.posts[0].author).toBeNull();
    expect(JSON.stringify(page.posts)).not.toContain("김민준");
  });

  it("읽기 문이 막으면 그대로 올린다", async () => {
    getReadableBySlug.mockRejectedValue(new ForbiddenError("community:read"));
    await expect(service.listPostPage(other, "free", 1)).rejects.toThrow(ForbiddenError);
    expect(listPosts).not.toHaveBeenCalled();
  });
});
