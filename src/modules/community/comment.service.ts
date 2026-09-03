import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { denyAccess } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import * as board from "./board.service";
import {
  FLOOD_WINDOW_MS,
  MAX_COMMENTS_PER_WINDOW,
  type CreateCommentInput,
  type DeleteCommentInput,
} from "./community.schema";
import { CommunityError } from "./community.error";
import * as repo from "./community.repo";
import { toCommentView, type CommentView } from "./community.view";

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
  const community = await board.getReadableBySlug(actor, post.community.slug);

  const rows = await repo.listComments(postId);
  return rows.map((row) => toCommentView(row, post, community, actor));
}

/* 도배 방지 — 최근 윈도 안에 이미 상한만큼 달았으면 더 달지 못한다. */
async function assertNotFloodingComments(
  actor: SessionUser,
  tx: Parameters<typeof repo.lockFloodBucket>[2],
): Promise<void> {
  await repo.lockFloodBucket(actor.id, "comment", tx);
  const since = new Date(Date.now() - FLOOD_WINDOW_MS);
  const recent = await repo.countRecentCommentsByAuthor(actor.id, since, tx);
  if (recent >= MAX_COMMENTS_PER_WINDOW) {
    throw new CommunityError("TOO_MANY_COMMENTS");
  }
}

export async function createComment(
  actor: SessionUser,
  input: CreateCommentInput,
): Promise<{ slug: string; postId: string }> {
  const post = await loadLivePost(input.postId);
  const community = await board.getWritableBySlug(actor, post.community.slug);

  await withTransaction(async (tx) => {
    await assertNotFloodingComments(actor, tx);

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
  const isModerator = can(actor, "community:moderate");
  if (!isMine && !isModerator) {
    await denyAccess(actor, "community:comment:delete", {
      targetType: "CommunityComment",
      targetId: input.commentId,
      actorName: actor.name,
    });
  }

  if (!isMine && !input.reason) throw new CommunityError("REASON_REQUIRED");

  await withTransaction(async (tx) => {
    const removed = await repo.markCommentDeleted(input.commentId, tx);
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
