"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
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

const MESSAGES: Record<string, string> = {
  COMMUNITY_NOT_FOUND: "게시판을 찾을 수 없습니다.",
  POST_NOT_FOUND: "글을 찾을 수 없습니다.",
  POST_CONFLICT: "다른 곳에서 글이 바뀌었습니다. 새로고침 후 다시 저장해 주세요.",
  COMMENT_NOT_FOUND: "댓글을 찾을 수 없습니다.",
  ATTACHMENT_NOT_FOUND: "첨부한 파일을 찾을 수 없습니다. 다시 올려 주세요.",
  ATTACHMENT_NOT_ALLOWED: "이 게시판은 첨부를 받지 않습니다.",
  REASON_REQUIRED: "다른 사람의 글·댓글을 지울 때는 사유를 적어야 합니다.",
};

function fail(error: string, values?: PostFormValues): PostFormState {
  return { ok: false, error, values };
}

function toMessage(error: unknown): string {
  // 권한 거부를 일반 폴백에 섞지 않는다 — 「처리하지 못했습니다」로 보이면
  // 권한이 없어서 막힌 사람이 일시적 장애로 알고 계속 다시 누른다.
  if (error instanceof ForbiddenError) return "이 작업을 할 권한이 없습니다.";
  if (error instanceof CommunityError) {
    return MESSAGES[error.message] ?? "처리하지 못했습니다.";
  }
  return "처리하지 못했습니다.";
}

/** 폼이 보낸 문자열 그대로. **본문은 다듬지 않는다** — 줄바꿈이 글쓴이의 모양이다. */
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
    return fail(toMessage(error), submitted);
  }

  revalidatePath(`/community/${created.slug}`);
  // redirect는 예외를 던진다 — try 밖에서 부른다. 안에서 부르면 catch가 그것을
  // 오류로 삼켜 「처리하지 못했습니다」가 뜬다.
  // 클라이언트가 이번 제출과 같은 sessionStorage 초안만 지울 수 있게 난수를
  // fragment로 돌려준다. JS 없는 제출에는 난수가 없으므로 fragment도 붙이지 않는다.
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
    return fail(toMessage(error), submitted);
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
    return fail(toMessage(error));
  }

  revalidatePath(`/community/${result.slug}`);
  redirect(`/community/${result.slug}`);
}

export async function createCommentAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const actor = await requireAuth();

  const parsed = createCommentSchema.safeParse({
    postId: formData.get("postId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  let result: { slug: string; postId: string };
  try {
    result = await commentService.createComment(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error));
  }

  revalidatePath(`/community/${result.slug}/${result.postId}`);
  // 목록의 댓글 수가 바뀐다.
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
    return fail(toMessage(error));
  }

  revalidatePath(`/community/${result.slug}/${result.postId}`);
  revalidatePath(`/community/${result.slug}`);
  return { ok: true, error: null };
}
