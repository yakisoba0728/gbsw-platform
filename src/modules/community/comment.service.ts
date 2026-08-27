import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import * as board from "./board.service";
import { CommunityError } from "./community.error";
import * as repo from "./community.repo";
import type { CreateCommentInput, DeleteCommentInput } from "./community.schema";
import { toCommentView, type CommentView } from "./community.view";

/**
 * 댓글 서비스. **수정은 없다** — 쓰기와 삭제뿐이다 (설계 §범위).
 *
 * 글 서비스와 마찬가지로 게시판 권한은 board.service의 문 둘로만 얻는다.
 */

async function denyOwnership(
  actor: SessionUser,
  action: string,
  commentId: string,
): Promise<never> {
  try {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "authz:denied",
      targetType: "CommunityComment",
      targetId: commentId,
      metadata: { action },
    });
  } catch {
    // 감사 기록 실패가 거부 자체를 막지 않는다.
  }
  throw new ForbiddenError(action);
}

/** 글을 집어 오며 "살아 있는가"까지 본다. 지워진 글에는 댓글이 안 달린다. */
async function loadLivePost(postId: string) {
  const post = await repo.findPost(postId);
  if (!post || post.deletedAt) throw new CommunityError("POST_NOT_FOUND");
  return post;
}

export async function listComments(
  actor: SessionUser,
  postId: string,
): Promise<CommentView[]> {
  const post = await loadLivePost(postId);
  // 글을 이미 읽었어도 게시판 권한을 다시 묻는다 — 주소만 알면 남의 게시판
  // 댓글이 열리는 길을 만들지 않는다.
  const community = await board.getReadableBySlug(actor, post.community.slug);

  const rows = await repo.listComments(postId);
  return rows.map((row) => toCommentView(row, post, community, actor));
}

export async function createComment(
  actor: SessionUser,
  input: CreateCommentInput,
): Promise<{ slug: string; postId: string }> {
  const post = await loadLivePost(input.postId);
  const community = await board.getWritableBySlug(actor, post.community.slug);

  await withTransaction(async (tx) => {
    const { id } = await repo.createComment(
      {
        postId: input.postId,
        body: input.body,
        authorUserId: actor.id,
        authorName: actor.name,
        authorRole: actor.role ?? "",
      },
      tx,
    );

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:comment:create",
        targetType: "CommunityComment",
        targetId: id,
        metadata: { postId: input.postId, slug: community.slug },
      },
      tx,
    );
  });

  return { slug: community.slug, postId: input.postId };
}

export async function deleteComment(
  actor: SessionUser,
  input: DeleteCommentInput,
): Promise<{ slug: string; postId: string }> {
  const comment = await repo.findComment(input.commentId);
  if (!comment || comment.deletedAt) throw new CommunityError("COMMENT_NOT_FOUND");

  const community = await board.getReadableBySlug(actor, comment.post.community.slug);

  const isMine = comment.authorUserId !== null && comment.authorUserId === actor.id;
  const isModerator = actor.role === "ADMIN";
  if (!isMine && !isModerator) {
    await denyOwnership(actor, "community:comment:delete", input.commentId);
  }

  await withTransaction(async (tx) => {
    const removed = await repo.markCommentDeleted(
      input.commentId,
      actor.id,
      input.reason,
      tx,
    );
    if (removed === 0) return;

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:comment:delete",
        targetType: "CommunityComment",
        targetId: input.commentId,
        metadata: {
          postId: comment.postId,
          slug: community.slug,
          byModerator: !isMine && isModerator,
          reason: input.reason,
        },
      },
      tx,
    );
  });

  return { slug: community.slug, postId: comment.postId };
}
