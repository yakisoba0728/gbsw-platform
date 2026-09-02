import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

const countPosts = vi.fn();
const listPosts = vi.fn();
const findPost = vi.fn();
const createPost = vi.fn();
const updatePost = vi.fn();
const markPostDeleted = vi.fn();
const attachToPost = vi.fn();
const detachFromPost = vi.fn();
const listAttachments = vi.fn();
const listRecentPostsAcross = vi.fn();
const getReadableBySlug = vi.fn();
const getWritableBySlug = vi.fn();
const listReadable = vi.fn();
const deleteAttachment = vi.fn();
const {
  recordAudit,
  auditEntries,
  txClient,
  prewiredWithTransaction: withTransaction,
} = coreMocks("post-service-test");

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
  listRecentPostsAcross,
}));
vi.mock("@/modules/community/board.service", () => ({
  getReadableBySlug,
  getWritableBySlug,
  listReadable,
}));
vi.mock("@/modules/community/community.storage", () => ({ deleteAttachment }));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { CommunityError } = await import("@/modules/community/community.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/community/post.service");

const student = user("STUDENT", "s-1", { name: "김민준" });
const other = user("STUDENT", "s-2", { name: "박도현" });
const admin = user("ADMIN", "a-1", { name: "이정민" });

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
  listReadable.mockResolvedValue([]);
  listRecentPostsAcross.mockResolvedValue([]);
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
  const attachableIds = new Set(["kept-a1", "kept-a2", "pending-a3"]);
  const input = {
    postId: "p1",
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    title: "새 제목",
    body: "새 본문",
    attachmentIds: [],
  };

  beforeEach(() => {
    findPost.mockResolvedValue({ ...row(), community: board() });
    attachToPost.mockImplementation(async (ids: string[]) =>
      ids.filter((id) => attachableIds.has(id)).length,
    );
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

  it("교사도 남의 글은 못 고친다 — 조정은 삭제이지 대필이 아니다", async () => {
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
    detachFromPost.mockResolvedValue([
      { id: "a9", storageKey: "c".repeat(32), filename: "옛파일.pdf", createdAt },
    ]);

    await service.updatePost(student, input);

    expect(deleteAttachment).toHaveBeenCalledWith("c".repeat(32), createdAt);
  });

  it("디스크 정리가 실패해도 이미 저장된 수정은 성공으로 돌려준다", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    detachFromPost.mockResolvedValue([
      {
        id: "a9",
        storageKey: "c".repeat(32),
        filename: "옛파일.pdf",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);
    deleteAttachment.mockRejectedValue(new Error("EROFS"));

    await expect(service.updatePost(student, input)).resolves.toEqual({ slug: "free" });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("그대로 둔 첨부만 제출해도 모두 보존한다", async () => {
    await service.updatePost(student, {
      ...input,
      attachmentIds: ["kept-a1", "kept-a2"],
    });

    expect(attachToPost).toHaveBeenCalledWith(
      ["kept-a1", "kept-a2"],
      "p1",
      "s-1",
      txClient,
    );
    expect(detachFromPost).toHaveBeenCalledWith(
      "p1",
      ["kept-a1", "kept-a2"],
      txClient,
    );
    expect(listAttachments).not.toHaveBeenCalled();
  });

  it("기존 첨부에 새 첨부를 더하면 둘을 모두 보존한다", async () => {
    await service.updatePost(student, {
      ...input,
      attachmentIds: ["kept-a1", "pending-a3"],
    });

    expect(attachToPost).toHaveBeenCalledWith(
      ["kept-a1", "pending-a3"],
      "p1",
      "s-1",
      txClient,
    );
    expect(detachFromPost).toHaveBeenCalledWith(
      "p1",
      ["kept-a1", "pending-a3"],
      txClient,
    );
  });

  it("기존 첨부 일부를 빼면 제출한 첨부만 남긴다", async () => {
    const createdAt = new Date("2026-08-01T00:00:00.000Z");
    detachFromPost.mockResolvedValue([
      {
        id: "kept-a1",
        storageKey: "c".repeat(32),
        filename: "뺀파일.pdf",
        createdAt,
      },
    ]);

    await service.updatePost(student, { ...input, attachmentIds: ["kept-a2"] });

    expect(detachFromPost).toHaveBeenCalledWith("p1", ["kept-a2"], txClient);
    expect(deleteAttachment).toHaveBeenCalledWith("c".repeat(32), createdAt);
  });

  it("고아 정리가 지운 첨부 id가 섞이면 저장과 감사로그를 막는다", async () => {
    await expect(
      service.updatePost(student, {
        ...input,
        attachmentIds: ["kept-a1", "expired"],
      }),
    ).rejects.toThrow(new CommunityError("ATTACHMENT_NOT_FOUND"));
    expect(detachFromPost).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(deleteAttachment).not.toHaveBeenCalled();
  });

  it("남이 올린 첨부 id를 제출하면 저장과 감사로그를 막는다", async () => {
    await expect(
      service.updatePost(student, { ...input, attachmentIds: ["stolen"] }),
    ).rejects.toThrow(new CommunityError("ATTACHMENT_NOT_FOUND"));
    expect(attachToPost).toHaveBeenCalledWith(["stolen"], "p1", "s-1", txClient);
    expect(detachFromPost).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(deleteAttachment).not.toHaveBeenCalled();
  });

  it("수정 감사로그의 attachments는 수정 뒤 남은 첨부 수다", async () => {
    detachFromPost.mockResolvedValue([
      {
        id: "kept-a1",
        storageKey: "c".repeat(32),
        filename: "뺀파일.pdf",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    await service.updatePost(student, { ...input, attachmentIds: ["kept-a2"] });

    expect(
      auditEntries().find((entry) => entry.action === "community:post:update")
        ?.metadata,
    ).toEqual({
      slug: "free",
      titleFrom: "제목",
      titleTo: "새 제목",
      attachments: 1,
      attachmentsRemoved: 1,
    });
  });

  it("뺀 첨부는 파일 이름과 함께 감사로그에 한 건씩 남는다 — 되돌릴 수 없는 삭제다", async () => {
    detachFromPost.mockResolvedValue([
      {
        id: "a9",
        storageKey: "c".repeat(32),
        filename: "옛파일.pdf",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    await service.updatePost(student, input);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:attachment:delete",
        targetId: "a9",
        metadata: expect.objectContaining({ filename: "옛파일.pdf" }),
      }),
      txClient,
    );
  });

  it("첨부를 안 받는 게시판이면 수정 경로로도 못 붙인다", async () => {
    findPost.mockResolvedValue({
      ...row(),
      community: board({ allowAttachments: false }),
    });
    getWritableBySlug.mockResolvedValue(board({ allowAttachments: false }));

    await expect(
      service.updatePost(student, { ...input, attachmentIds: ["a1"] }),
    ).rejects.toThrow(new CommunityError("ATTACHMENT_NOT_ALLOWED"));
    expect(updatePost).not.toHaveBeenCalled();
  });

  it("첨부를 안 받게 바뀐 게시판은 빈 첨부 목록을 기존 파일 삭제로 읽지 않는다", async () => {
    findPost.mockResolvedValue({
      ...row(),
      community: board({ allowAttachments: false }),
    });
    getWritableBySlug.mockResolvedValue(board({ allowAttachments: false }));

    await service.updatePost(student, input);

    expect(detachFromPost).not.toHaveBeenCalled();
    expect(deleteAttachment).not.toHaveBeenCalled();
    expect(
      auditEntries().find((entry) => entry.action === "community:post:update")
        ?.metadata,
    ).not.toHaveProperty("attachments");
  });

  it("첨부를 받는 게시판은 제출 목록을 기준으로 떼어 낼 파일을 묻는다", async () => {
    await service.updatePost(student, input);

    expect(detachFromPost).toHaveBeenCalledWith("p1", [], txClient);
  });

  it("롤백되면 디스크를 안 건드린다", async () => {
    detachFromPost.mockResolvedValue([
      {
        id: "a9",
        storageKey: "c".repeat(32),
        filename: "옛파일.pdf",
        createdAt: new Date(),
      },
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

    expect(markPostDeleted).toHaveBeenCalledWith("p1", txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "s-1",
        actorName: "김민준",
        action: "community:post:delete",
        metadata: expect.objectContaining({
          byModerator: false,
          reason: "잘못 올렸습니다",
        }),
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

  it("남의 글을 사유 없이 지우려 하면 거부한다 — 화면을 건너뛴 요청도 막는다", async () => {
    await expect(
      service.deletePost(admin, { postId: "p1", reason: null }),
    ).rejects.toThrow(new CommunityError("REASON_REQUIRED"));
    expect(markPostDeleted).not.toHaveBeenCalled();
  });

  it("내 글은 사유 없이 지운다 — 물을 이유가 없다", async () => {
    await expect(
      service.deletePost(student, { postId: "p1", reason: null }),
    ).resolves.toBeDefined();
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

describe("listRecentPosts", () => {
  const anonymousBoard = board({
    id: "c2",
    slug: "worry",
    name: "고민 게시판",
    anonymous: true,
  });

  beforeEach(() => {
    listReadable.mockResolvedValue([board(), anonymousBoard]);
  });

  it("익명 게시판 글만 작성자를 지운다 — 결과 어디에도 그 이름이 없다", async () => {
    listRecentPostsAcross.mockResolvedValue([
      row({ id: "p1", communityId: "c1", authorName: "김민준", authorUserId: "s-1" }),
      row({ id: "p2", communityId: "c2", authorName: "최유진", authorUserId: "s-9" }),
    ]);

    const result = await service.listRecentPosts(other, 5);

    expect(result[0].author).toMatchObject({ name: "김민준" });
    expect(result[0].communitySlug).toBe("free");
    expect(result[1].author).toBeNull();
    expect(result[1].communityName).toBe("고민 게시판");
    expect(JSON.stringify(result)).not.toContain("최유진");
    expect(JSON.stringify(result)).toContain("김민준");
  });

  it("읽을 수 있는 게시판 안에서만 찾는다", async () => {
    await service.listRecentPosts(other, 5);
    expect(listRecentPostsAcross).toHaveBeenCalledWith(["c1", "c2"], 5);
  });

  it("읽을 수 있는 게시판이 없으면 repo를 아예 부르지 않는다", async () => {
    listReadable.mockResolvedValue([]);

    await expect(service.listRecentPosts(other, 5)).resolves.toEqual([]);
    expect(listRecentPostsAcross).not.toHaveBeenCalled();
  });
});
