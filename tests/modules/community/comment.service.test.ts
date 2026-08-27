import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const listComments = vi.fn();
const findComment = vi.fn();
const createComment = vi.fn();
const markCommentDeleted = vi.fn();
const findPost = vi.fn();
const getReadableBySlug = vi.fn();
const getWritableBySlug = vi.fn();
const recordAudit = vi.fn();
const txClient = { tx: "comment-service-test" };
const withTransaction = vi.fn(
  async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
);

vi.mock("@/modules/community/community.repo", () => ({
  listComments,
  findComment,
  createComment,
  markCommentDeleted,
  findPost,
}));
vi.mock("@/modules/community/board.service", () => ({
  getReadableBySlug,
  getWritableBySlug,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { CommunityError } = await import("@/modules/community/community.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/community/comment.service");

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

const namedBoard = {
  id: "c1",
  slug: "free",
  name: "자유게시판",
  anonymous: false,
  active: true,
  readRoles: ["STUDENT"],
  writeRoles: ["STUDENT"],
};
const anonBoard = { ...namedBoard, slug: "worry", name: "고민상담", anonymous: true };

function post(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    communityId: "c1",
    title: "제목",
    authorUserId: "s-1" as string | null,
    authorName: "김민준",
    authorRole: "STUDENT",
    deletedAt: null as Date | null,
    community: namedBoard,
    ...over,
  };
}

function comment(over: Record<string, unknown> = {}) {
  return {
    id: "cm1",
    postId: "p1",
    body: "댓글",
    authorUserId: "s-1" as string | null,
    authorName: "김민준",
    authorRole: "STUDENT",
    deletedAt: null as Date | null,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findPost.mockResolvedValue(post());
  getReadableBySlug.mockResolvedValue(namedBoard);
  getWritableBySlug.mockResolvedValue(namedBoard);
  createComment.mockResolvedValue({ id: "cm1" });
  markCommentDeleted.mockResolvedValue(1);
  listComments.mockResolvedValue([]);
});

describe("createComment", () => {
  const input = { postId: "p1", body: "댓글" };

  it("쓰기 문을 지나야 쓴다 — 작성자 스냅샷을 넣고 감사로그를 남긴다", async () => {
    const result = await service.createComment(student, input);

    expect(getWritableBySlug).toHaveBeenCalledWith(student, "free");
    expect(createComment).toHaveBeenCalledWith(
      {
        postId: "p1",
        body: "댓글",
        authorUserId: "s-1",
        authorName: "김민준",
        authorRole: "STUDENT",
      },
      txClient,
    );
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "community:comment:create", targetId: "cm1" }),
      txClient,
    );
    expect(result).toEqual({ slug: "free", postId: "p1" });
  });

  it("읽기만 되는 게시판이면 거부한다", async () => {
    getWritableBySlug.mockRejectedValue(new ForbiddenError("community:write"));
    await expect(service.createComment(other, input)).rejects.toThrow(ForbiddenError);
    expect(createComment).not.toHaveBeenCalled();
  });

  it("지워진 글에는 못 단다", async () => {
    findPost.mockResolvedValue(post({ deletedAt: new Date() }));
    await expect(service.createComment(student, input)).rejects.toThrow(
      new CommunityError("POST_NOT_FOUND"),
    );
    expect(getWritableBySlug).not.toHaveBeenCalled();
  });

  it("없는 글이면 POST_NOT_FOUND", async () => {
    findPost.mockResolvedValue(null);
    await expect(service.createComment(student, input)).rejects.toThrow(
      new CommunityError("POST_NOT_FOUND"),
    );
  });
});

describe("listComments", () => {
  it("읽기 문을 지나 뷰로 바꿔 준다 — 글쓴이 배지가 붙는다", async () => {
    listComments.mockResolvedValue([
      comment(),
      comment({ id: "cm2", authorUserId: "s-9", authorName: "최유진" }),
    ]);

    const views = await service.listComments(other, "p1");

    expect(getReadableBySlug).toHaveBeenCalledWith(other, "free");
    expect(views[0].byPostAuthor).toBe(true);
    expect(views[1].byPostAuthor).toBe(false);
    expect(views[0].author?.display).toBe("김민준님");
  });

  it("익명 게시판이면 작성자가 없다 — 교사에게도", async () => {
    findPost.mockResolvedValue(post({ community: anonBoard }));
    getReadableBySlug.mockResolvedValue(anonBoard);
    listComments.mockResolvedValue([comment()]);

    const views = await service.listComments(admin, "p1");

    expect(views[0].author).toBeNull();
    expect(JSON.stringify(views)).not.toContain("김민준");
    // 글쓴이 배지는 익명에서도 켜진다 — 누구인지는 여전히 모른다.
    expect(views[0].byPostAuthor).toBe(true);
  });

  it("읽기 문이 막으면 그대로 올린다", async () => {
    getReadableBySlug.mockRejectedValue(new ForbiddenError("community:read"));
    await expect(service.listComments(other, "p1")).rejects.toThrow(ForbiddenError);
    expect(listComments).not.toHaveBeenCalled();
  });
});

describe("deleteComment", () => {
  const input = { commentId: "cm1", reason: null };

  beforeEach(() => {
    findComment.mockResolvedValue({ ...comment(), post: post() });
  });

  it("본인은 지운다 — byModerator는 false", async () => {
    await service.deleteComment(student, input);

    expect(markCommentDeleted).toHaveBeenCalledWith("cm1", "s-1", null, txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "community:comment:delete",
        metadata: expect.objectContaining({ byModerator: false, postId: "p1" }),
      }),
      txClient,
    );
  });

  it("교사는 남의 댓글도 지운다 — byModerator는 true", async () => {
    await service.deleteComment(admin, input);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ byModerator: true }),
      }),
      txClient,
    );
  });

  it("남은 못 지운다", async () => {
    await expect(service.deleteComment(other, input)).rejects.toThrow(ForbiddenError);
    expect(markCommentDeleted).not.toHaveBeenCalled();
  });

  it("계정이 지워진 댓글은 본인도 못 지운다", async () => {
    findComment.mockResolvedValue({
      ...comment({ authorUserId: null }),
      post: post(),
    });
    await expect(service.deleteComment(student, input)).rejects.toThrow(ForbiddenError);
  });

  it("없는 댓글이면 COMMENT_NOT_FOUND", async () => {
    findComment.mockResolvedValue(null);
    await expect(service.deleteComment(student, input)).rejects.toThrow(
      new CommunityError("COMMENT_NOT_FOUND"),
    );
  });

  it("이미 지운 댓글이면 COMMENT_NOT_FOUND", async () => {
    findComment.mockResolvedValue({
      ...comment({ deletedAt: new Date() }),
      post: post(),
    });
    await expect(service.deleteComment(student, input)).rejects.toThrow(
      new CommunityError("COMMENT_NOT_FOUND"),
    );
  });

  it("경쟁해서 0줄이 지워지면 감사로그를 또 남기지 않는다", async () => {
    markCommentDeleted.mockResolvedValue(0);
    await service.deleteComment(student, input);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
