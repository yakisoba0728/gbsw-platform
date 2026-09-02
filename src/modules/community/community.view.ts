import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { honorificName, isRole, type Role } from "@/core/authz/roles";

export type Author = {
  name: string;
  role: Role | null;
  display: string;
};

type ViewCommunity = { anonymous: boolean };

type AuthoredRow = {
  authorUserId: string | null;
  authorName: string;
  authorRole: string;
};

// 익명 게시판은 관리자에게도 작성자 정보를 노출하지 않는다.
function toAuthor(row: AuthoredRow, community: ViewCommunity): Author | null {
  if (community.anonymous) return null;

  const role = isRole(row.authorRole) ? row.authorRole : null;
  return { name: row.authorName, role, display: honorificName(row.authorName, role) };
}

function isSamePerson(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

type PostRow = AuthoredRow & {
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
  author: Author | null;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function toPostView(
  row: PostRow,
  community: ViewCommunity,
  viewer: SessionUser,
): PostView {
  // DB 행을 펼치지 않고 공개 필드만 선택한다.
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
    canDelete: isMine || can(viewer, "community:moderate"),
  };
}

export type PostListItemView = Omit<PostView, "body"> & { commentCount: number };

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

type CommentRow = AuthoredRow & {
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
