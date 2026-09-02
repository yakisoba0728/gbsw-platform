"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/session";
import { actionMessage } from "@/lib/action-message";
import * as commentService from "@/modules/community/comment.service";
import { CommunityError } from "@/modules/community/community.error";
import {
  createCommentSchema,
  createPostSchema,
  deleteCommentSchema,
  deletePostSchema,
  updatePostSchema,
} from "@/modules/community/community.schema";
import * as service from "@/modules/community/post.service";
import type { PostFormState, PostFormValues } from "./action-state";
import {
  parsePostDraftNonce,
  postDraftCompletionHash,
} from "./post-draft";

const MESSAGES = {
  FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  COMMUNITY_NOT_FOUND: "게시판을 찾을 수 없습니다.",
  POST_NOT_FOUND: "글을 찾을 수 없습니다.",
  POST_CONFLICT: "다른 곳에서 글이 바뀌었습니다. 새로고침 후 다시 저장해 주세요.",
  COMMENT_NOT_FOUND: "댓글을 찾을 수 없습니다.",
  ATTACHMENT_NOT_FOUND: "첨부한 파일을 찾을 수 없습니다. 다시 올려 주세요.",
  ATTACHMENT_NOT_ALLOWED: "이 게시판은 첨부를 받지 않습니다.",
  REASON_REQUIRED: "다른 사람의 글·댓글을 지울 때는 사유를 적어야 합니다.",
} satisfies Record<string, string>;

function fail(error: string, values?: PostFormValues): PostFormState {
  return { ok: false, error, values };
}

const messageFor = actionMessage(CommunityError, MESSAGES, "[community]");

function values(formData: FormData): PostFormValues {
  return {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
  };
}

export async function createPostAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const actor = await requireAuth();
  const submitted = values(formData);
  const draftNonce = parsePostDraftNonce(formData.get("draftNonce"));

  const parsed = createPostSchema.safeParse({
    slug: formData.get("slug"),
    title: formData.get("title"),
    body: formData.get("body"),
    attachmentIds: formData.getAll("attachmentIds"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", submitted);
  }

  let created: { postId: string; slug: string };
  try {
    created = await service.createPost(actor, parsed.data);
  } catch (error) {
    return fail(messageFor(error, "처리하지 못했습니다."), submitted);
  }

  revalidatePath(`/community/${created.slug}`);
  const completion = draftNonce ? postDraftCompletionHash(draftNonce) : "";
  redirect(`/community/${created.slug}/${created.postId}${completion}`);
}

export async function updatePostAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const actor = await requireAuth();
  const submitted = values(formData);
  const postId = String(formData.get("postId") ?? "");

  const parsed = updatePostSchema.safeParse({
    postId,
    updatedAt: formData.get("updatedAt"),
    title: formData.get("title"),
    body: formData.get("body"),
    attachmentIds: formData.getAll("attachmentIds"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", submitted);
  }

  let result: { slug: string };
  try {
    result = await service.updatePost(actor, parsed.data);
  } catch (error) {
    return fail(messageFor(error, "처리하지 못했습니다."), submitted);
  }

  revalidatePath(`/community/${result.slug}`);
  revalidatePath(`/community/${result.slug}/${postId}`);
  redirect(`/community/${result.slug}/${postId}`);
}

export async function deletePostAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const actor = await requireAuth();

  const parsed = deletePostSchema.safeParse({
    postId: formData.get("postId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  let result: { slug: string };
  try {
    result = await service.deletePost(actor, parsed.data);
  } catch (error) {
    return fail(messageFor(error, "처리하지 못했습니다."));
  }

  revalidatePath(`/community/${result.slug}`);
  redirect(`/community/${result.slug}`);
}

export async function createCommentAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const actor = await requireAuth();
  const submitted = values(formData);

  const parsed = createCommentSchema.safeParse({
    postId: formData.get("postId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", submitted);
  }

  let result: { slug: string; postId: string };
  try {
    result = await commentService.createComment(actor, parsed.data);
  } catch (error) {
    return fail(messageFor(error, "처리하지 못했습니다."), submitted);
  }

  revalidatePath(`/community/${result.slug}/${result.postId}`);
  revalidatePath(`/community/${result.slug}`);
  return { ok: true, error: null };
}

export async function deleteCommentAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const actor = await requireAuth();

  const parsed = deleteCommentSchema.safeParse({
    commentId: formData.get("commentId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  let result: { slug: string; postId: string };
  try {
    result = await commentService.deleteComment(actor, parsed.data);
  } catch (error) {
    return fail(messageFor(error, "처리하지 못했습니다."));
  }

  revalidatePath(`/community/${result.slug}/${result.postId}`);
  revalidatePath(`/community/${result.slug}`);
  return { ok: true, error: null };
}
