import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import {
  toCommentView,
  toPostListItem,
  toPostView,
} from "@/modules/community/community.view";

function viewer(role: SessionUser["role"], id: string): SessionUser {
  return {
    id,
    name: "보는사람",
    email: "v@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const student = viewer("STUDENT", "s-1");
const other = viewer("STUDENT", "s-2");
const admin = viewer("ADMIN", "a-1");

const named = { anonymous: false };
const anon = { anonymous: true };

function post(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    communityId: "c1",
    title: "제목",
    body: "본문",
    authorUserId: "s-1" as string | null,
    authorName: "김민준",
    authorRole: "STUDENT",
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
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
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    ...over,
  };
}

describe("toPostView — 실명 게시판", () => {
  it("작성자를 호칭과 함께 준다", () => {
    const view = toPostView(post(), named, other);
    expect(view.author).toEqual({
      name: "김민준",
      role: "STUDENT",
      display: "김민준님",
    });
  });

  it("교사 작성자에는 「선생님」이 붙는다", () => {
    const view = toPostView(
      post({ authorName: "이정민", authorRole: "ADMIN" }),
      named,
      other,
    );
    expect(view.author?.display).toBe("이정민 선생님");
  });

  it("학부모 작성자에는 「학부모님」이 붙는다", () => {
    const view = toPostView(
      post({ authorName: "김보호", authorRole: "PARENT" }),
      named,
      other,
    );
    expect(view.author?.display).toBe("김보호 학부모님");
  });

  it("계정이 지워져 역할을 모르면 「님」으로 떨어진다", () => {
    const view = toPostView(post({ authorUserId: null, authorRole: "" }), named, other);
    expect(view.author?.display).toBe("김민준님");
    expect(view.author?.role).toBeNull();
  });
});

describe("toPostView — 익명 게시판", () => {
  it("작성자가 null이다", () => {
    expect(toPostView(post(), anon, other).author).toBeNull();
  });

  it("교사에게도 null이다 — 익명은 화면에서 예외가 없다", () => {
    expect(toPostView(post(), anon, admin).author).toBeNull();
  });

  it("본인 여부는 계속 계산한다 — 수정·삭제 버튼이 필요하다", () => {
    expect(toPostView(post(), anon, student).isMine).toBe(true);
    expect(toPostView(post(), anon, other).isMine).toBe(false);
  });

  it("결과 객체 어디에도 작성자 이름이 없다", () => {
    const view = toPostView(post(), anon, admin);
    expect(JSON.stringify(view)).not.toContain("김민준");
    expect(JSON.stringify(view)).not.toContain("s-1");
  });

  it("목록 항목도 같다", () => {
    const item = toPostListItem(post(), anon, admin, 3);
    expect(item.author).toBeNull();
    expect(JSON.stringify(item)).not.toContain("김민준");
    expect(item.commentCount).toBe(3);
  });

  it("댓글도 같다", () => {
    const view = toCommentView(comment(), post(), anon, admin);
    expect(view.author).toBeNull();
    expect(JSON.stringify(view)).not.toContain("김민준");
  });
});

describe("toPostListItem", () => {
  it("본문을 싣지 않는다 — 스무 개의 전문을 목록이 들고 있을 이유가 없다", () => {
    const item = toPostListItem(post({ body: "아주 긴 본문" }), named, other, 0);
    expect(item).not.toHaveProperty("body");
    expect(JSON.stringify(item)).not.toContain("아주 긴 본문");
  });
});

describe("권한 플래그", () => {
  it("본인은 고치고 지운다", () => {
    const view = toPostView(post(), named, student);
    expect(view.canEdit).toBe(true);
    expect(view.canDelete).toBe(true);
  });

  it("남은 못 고치고 못 지운다", () => {
    const view = toPostView(post(), named, other);
    expect(view.canEdit).toBe(false);
    expect(view.canDelete).toBe(false);
  });

  it("교사는 못 고치고 지우기만 한다 — 조정은 삭제이지 대필이 아니다", () => {
    const view = toPostView(post(), named, admin);
    expect(view.canEdit).toBe(false);
    expect(view.canDelete).toBe(true);
  });

  it("계정이 지워진 글은 아무도 못 고친다", () => {
    const view = toPostView(post({ authorUserId: null }), named, student);
    expect(view.isMine).toBe(false);
    expect(view.canEdit).toBe(false);
  });

  it("댓글도 본인 또는 교사만 지운다", () => {
    expect(toCommentView(comment(), post(), named, student).canDelete).toBe(true);
    expect(toCommentView(comment(), post(), named, other).canDelete).toBe(false);
    expect(toCommentView(comment(), post(), named, admin).canDelete).toBe(true);
  });
});

describe("글쓴이 배지", () => {
  it("글쓴이가 단 댓글이면 켜진다 — 익명에서도", () => {
    expect(toCommentView(comment(), post(), anon, other).byPostAuthor).toBe(true);
  });

  it("남이 단 댓글이면 꺼진다", () => {
    const view = toCommentView(comment({ authorUserId: "s-9" }), post(), anon, other);
    expect(view.byPostAuthor).toBe(false);
  });

  it("둘 다 계정이 지워졌으면 켜지 않는다 — null == null로 켜면 남남이 한 사람이 된다", () => {
    const view = toCommentView(
      comment({ authorUserId: null }),
      post({ authorUserId: null }),
      anon,
      other,
    );
    expect(view.byPostAuthor).toBe(false);
  });
});
