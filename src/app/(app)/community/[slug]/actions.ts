"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defineFormAction } from "@/lib/action";
import { text } from "@/lib/action-message";
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
  TOO_MANY_POSTS: "글을 너무 빠르게 작성하고 있습니다. 잠시 후 다시 시도해 주세요.",
  TOO_MANY_COMMENTS: "댓글을 너무 빠르게 작성하고 있습니다. 잠시 후 다시 시도해 주세요.",
  REASON_REQUIRED: "다른 사람의 글·댓글을 지울 때는 사유를 적어야 합니다.",
} satisfies Record<string, string>;

function values(formData: FormData): PostFormValues {
  return {
    title: text(formData, "title"),
    body: text(formData, "body"),
  };
}

export const createPostAction = defineFormAction<PostFormState>()({
  schema: createPostSchema,
  input: (formData) => ({
    slug: formData.get("slug"),
    title: formData.get("title"),
    body: formData.get("body"),
    attachmentIds: formData.getAll("attachmentIds"),
  }),
  failState: (error, formData) => ({
    ok: false,
    error,
    values: values(formData),
  }),
  run: async (actor, data, formData) => {
    const created = await service.createPost(actor, data);
    revalidatePath(`/community/${created.slug}`);
    const draftNonce = parsePostDraftNonce(formData.get("draftNonce"));
    const completion = draftNonce ? postDraftCompletionHash(draftNonce) : "";
    redirect(`/community/${created.slug}/${created.postId}${completion}`);
  },
  errorClass: CommunityError,
  messages: MESSAGES,
  logPrefix: "[community]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "처리하지 못했습니다.",
});

export const updatePostAction = defineFormAction<PostFormState>()({
  schema: updatePostSchema,
  input: (formData) => ({
    postId: text(formData, "postId"),
    updatedAt: formData.get("updatedAt"),
    title: formData.get("title"),
    body: formData.get("body"),
    attachmentIds: formData.getAll("attachmentIds"),
  }),
  failState: (error, formData) => ({
    ok: false,
    error,
    values: values(formData),
  }),
  run: async (actor, data) => {
    const result = await service.updatePost(actor, data);
    revalidatePath(`/community/${result.slug}`);
    revalidatePath(`/community/${result.slug}/${data.postId}`);
    redirect(`/community/${result.slug}/${data.postId}`);
  },
  errorClass: CommunityError,
  messages: MESSAGES,
  logPrefix: "[community]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "처리하지 못했습니다.",
});

export const deletePostAction = defineFormAction<PostFormState>()({
  schema: deletePostSchema,
  input: (formData) => ({
    postId: formData.get("postId"),
    reason: formData.get("reason"),
  }),
  failState: (error) => ({ ok: false, error }),
  run: async (actor, data) => {
    const result = await service.deletePost(actor, data);
    revalidatePath(`/community/${result.slug}`);
    redirect(`/community/${result.slug}`);
  },
  errorClass: CommunityError,
  messages: MESSAGES,
  logPrefix: "[community]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "처리하지 못했습니다.",
});

export const createCommentAction = defineFormAction<PostFormState>()({
  schema: createCommentSchema,
  input: (formData) => ({
    postId: formData.get("postId"),
    body: formData.get("body"),
  }),
  failState: (error, formData) => ({
    ok: false,
    error,
    values: values(formData),
  }),
  run: async (actor, data) => {
    const result = await commentService.createComment(actor, data);
    revalidatePath(`/community/${result.slug}/${result.postId}`);
    revalidatePath(`/community/${result.slug}`);
    return { ok: true, error: null };
  },
  errorClass: CommunityError,
  messages: MESSAGES,
  logPrefix: "[community]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "처리하지 못했습니다.",
});

export const deleteCommentAction = defineFormAction<PostFormState>()({
  schema: deleteCommentSchema,
  input: (formData) => ({
    commentId: formData.get("commentId"),
    reason: formData.get("reason"),
  }),
  failState: (error) => ({ ok: false, error }),
  run: async (actor, data) => {
    const result = await commentService.deleteComment(actor, data);
    revalidatePath(`/community/${result.slug}/${result.postId}`);
    revalidatePath(`/community/${result.slug}`);
    return { ok: true, error: null };
  },
  errorClass: CommunityError,
  messages: MESSAGES,
  logPrefix: "[community]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "처리하지 못했습니다.",
});
