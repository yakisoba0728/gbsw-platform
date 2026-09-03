"use server";

import { revalidatePath } from "next/cache";
import { defineFormAction } from "@/lib/action";
import { text } from "@/lib/action-message";
import * as service from "@/modules/community/board.service";
import { CommunityError } from "@/modules/community/community.error";
import {
  createCommunitySchema,
  deleteCommunitySchema,
  updateCommunitySchema,
} from "@/modules/community/community.schema";
import type { CommunityFormState, CommunityFormValues } from "./action-state";

const MESSAGES = {
  FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  SLUG_TAKEN: "이미 같은 주소를 쓰는 게시판이 있습니다.",
  COMMUNITY_NOT_FOUND: "게시판을 찾을 수 없습니다.",
  COMMUNITY_CONFLICT:
    "다른 교사가 게시판을 바꿨습니다. 새로고침 후 다시 저장해 주세요.",
  ANONYMOUS_IRREVERSIBLE:
    "익명 게시판은 되돌릴 수 없습니다. 끄면 그동안 쌓인 글의 작성자가 모두 드러납니다.",
} satisfies Record<string, string>;

function values(formData: FormData): CommunityFormValues {
  return {
    slug: text(formData, "slug"),
    name: text(formData, "name"),
    description: text(formData, "description"),
    readRoles: formData.getAll("readRoles").map(String),
    writeRoles: formData.getAll("writeRoles").map(String),
    anonymous: formData.get("anonymous") === "on",
    allowAttachments: formData.get("allowAttachments") === "on",
    sortOrder: text(formData, "sortOrder"),
  };
}

function raw(formData: FormData) {
  return {
    slug: formData.get("slug"),
    name: formData.get("name"),
    description: formData.get("description"),
    readRoles: formData.getAll("readRoles"),
    writeRoles: formData.getAll("writeRoles"),
    anonymous: formData.get("anonymous"),
    allowAttachments: formData.get("allowAttachments"),
    sortOrder: formData.get("sortOrder"),
  };
}

function revalidateBoards(): void {
  revalidatePath("/admin/community");
  revalidatePath("/community");
}

export const createCommunityAction = defineFormAction<CommunityFormState>()({
  schema: createCommunitySchema,
  input: raw,
  failState: (error, formData) => ({
    ok: false,
    error,
    values: values(formData),
  }),
  run: async (actor, data) => {
    await service.createCommunity(actor, data);
    revalidateBoards();
    return { ok: true, error: null };
  },
  errorClass: CommunityError,
  messages: MESSAGES,
  logPrefix: "[community]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "처리하지 못했습니다.",
});

export const updateCommunityAction = defineFormAction<CommunityFormState>()({
  schema: updateCommunitySchema,
  input: (formData) => ({
    communityId: formData.get("communityId"),
    updatedAt: formData.get("updatedAt"),
    ...raw(formData),
  }),
  failState: (error, formData) => ({
    ok: false,
    error,
    values: values(formData),
  }),
  run: async (actor, data) => {
    await service.updateCommunity(actor, data);
    revalidateBoards();
    revalidatePath(`/admin/community/${data.communityId}`);
    return { ok: true, error: null };
  },
  errorClass: CommunityError,
  messages: MESSAGES,
  logPrefix: "[community]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "처리하지 못했습니다.",
});

export const deleteCommunityAction = defineFormAction<CommunityFormState>()({
  schema: deleteCommunitySchema,
  input: (formData) => ({
    communityId: formData.get("communityId"),
    updatedAt: formData.get("updatedAt"),
    reason: formData.get("reason"),
  }),
  failState: (error) => ({ ok: false, error }),
  run: async (actor, data) => {
    await service.deleteCommunity(actor, data);
    revalidateBoards();
    revalidatePath(`/admin/community/${data.communityId}`);
    return { ok: true, error: null };
  },
  errorClass: CommunityError,
  messages: MESSAGES,
  logPrefix: "[community]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "처리하지 못했습니다.",
});
