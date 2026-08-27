import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { honorificName, isRole, type Role } from "@/core/authz/roles";

/**
 * repo 행을 화면이 쓰는 객체로 바꾼다. **익명을 가리는 자리는 여기 하나뿐이다.**
 *
 * 행에는 작성자가 늘 들어 있다(`authorUserId`·`authorName`·`authorRole`).
 * 익명 게시판이면 이 파일이 그 필드를 **지운 객체**를 만든다 — 화면 코드가
 * 실수로 흘릴 열 자체가 없게 하는 것이 목적이다.
 *
 * **페이지·서버 액션·라우트 핸들러 어느 것도 repo 행을 직접 화면으로 넘기지
 * 않는다.** 넘기는 순간 이 파일이 하는 일이 무의미해진다.
 */

export type Author = {
  name: string;
  /** 모르는 역할(계정이 지워진 뒤)이면 null. */
  role: Role | null;
  /** 호칭까지 붙인 표시용 이름. 화면은 이것만 쓴다. */
  display: string;
};

/** 판정에 필요한 게시판 성질만. 커뮤니티 행 전체를 받지 않는다. */
type ViewCommunity = { anonymous: boolean };

type AuthoredRow = {
  authorUserId: string | null;
  authorName: string;
  authorRole: string;
};

function toAuthor(row: AuthoredRow, community: ViewCommunity): Author | null {
  // 익명이면 이름도 역할도 만들지 않는다. 필드를 null로 덮는 것이 아니라
  // 애초에 객체를 안 만든다 — 아래 어느 필드로도 이름이 새지 않는다.
  if (community.anonymous) return null;

  const role = isRole(row.authorRole) ? row.authorRole : null;
  return { name: row.authorName, role, display: honorificName(row.authorName, role) };
}

/**
 * 같은 사람인가. **양쪽이 다 null이면 false다** — 계정이 지워진 글 둘을 같은
 * 사람으로 묶으면 남남이 한 사람이 된다.
 */
function isSamePerson(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

export type PostRow = AuthoredRow & {
  id: string;
  communityId: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PostView = {
  id: string;
  communityId: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  /** 익명 게시판이면 null. */
  author: Author | null;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

/**
 * `canEdit`은 본인뿐이다 — **교사도 남의 글을 못 고친다.** 조정은 지우는 일이지
 * 대신 쓰는 일이 아니다. 지운 자국(`deletedAt`)은 남지만 고친 자국은 안 남아,
 * 교사가 학생 글의 내용을 바꿀 수 있으면 그 게시판의 글은 아무것도 증명하지 못한다.
 */
export function toPostView(
  row: PostRow,
  community: ViewCommunity,
  viewer: SessionUser,
): PostView {
  const isMine = isSamePerson(row.authorUserId, viewer.id);
  return {
    id: row.id,
    communityId: row.communityId,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: toAuthor(row, community),
    isMine,
    canEdit: isMine,
    // 삭제 버튼을 그릴지. 조정 판정은 `can()`이 한다 — 서비스와 같은 근거를
    // 봐야 버튼은 보이는데 눌리지 않는 일이 없다.
    canDelete: isMine || can(viewer, "community:moderate"),
  };
}

export type PostListItemView = Omit<PostView, "body"> & { commentCount: number };

/**
 * 목록 항목. 본문은 안 싣는다 — 스무 개의 전문을 목록이 들고 있을 이유가 없다.
 *
 * 필드를 하나씩 적는다. 구조분해로 `body`만 버리면 그 변수가 쓰이지 않아
 * lint가 걸리고, 무엇보다 **무엇을 뺐는지가 코드에서 안 보인다.**
 */
export function toPostListItem(
  row: PostRow,
  community: ViewCommunity,
  viewer: SessionUser,
  commentCount: number,
): PostListItemView {
  const view = toPostView(row, community, viewer);
  return {
    id: view.id,
    communityId: view.communityId,
    title: view.title,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    author: view.author,
    isMine: view.isMine,
    canEdit: view.canEdit,
    canDelete: view.canDelete,
    commentCount,
  };
}

export type CommentRow = AuthoredRow & {
  id: string;
  postId: string;
  body: string;
  createdAt: Date;
};

export type CommentView = {
  id: string;
  postId: string;
  body: string;
  createdAt: Date;
  author: Author | null;
  isMine: boolean;
  canDelete: boolean;
  /** 글쓴이가 자기 글에 단 댓글인가. 익명에서도 켜진다 — 누구인지는 여전히 모른다. */
  byPostAuthor: boolean;
};

export function toCommentView(
  row: CommentRow,
  post: Pick<AuthoredRow, "authorUserId">,
  community: ViewCommunity,
  viewer: SessionUser,
): CommentView {
  const isMine = isSamePerson(row.authorUserId, viewer.id);
  return {
    id: row.id,
    postId: row.postId,
    body: row.body,
    createdAt: row.createdAt,
    author: toAuthor(row, community),
    isMine,
    canDelete: isMine || can(viewer, "community:moderate"),
    byPostAuthor: isSamePerson(row.authorUserId, post.authorUserId),
  };
}
