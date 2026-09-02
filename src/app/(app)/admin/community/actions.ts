"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { actionMessage, text } from "@/lib/action-message";
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

function fail(error: string, values?: CommunityFormValues): CommunityFormState {
  return { ok: false, error, values };
}

const messageFor = actionMessage(CommunityError, MESSAGES, "[community]");

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

export async function createCommunityAction(
  _prev: CommunityFormState,
  formData: FormData,
): Promise<CommunityFormState> {
  const actor = await requireAuth();
  const submitted = values(formData);

  const parsed = createCommunitySchema.safeParse(raw(formData));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", submitted);
  }

  try {
    await service.createCommunity(actor, parsed.data);
  } catch (error) {
    return fail(messageFor(error, "처리하지 못했습니다."), submitted);
  }

  revalidateBoards();
  return { ok: true, error: null };
}

export async function updateCommunityAction(
  _prev: CommunityFormState,
  formData: FormData,
): Promise<CommunityFormState> {
  const actor = await requireAuth();
  const submitted = values(formData);

  const parsed = updateCommunitySchema.safeParse({
    communityId: formData.get("communityId"),
    updatedAt: formData.get("updatedAt"),
    ...raw(formData),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", submitted);
  }

  try {
    await service.updateCommunity(actor, parsed.data);
  } catch (error) {
    return fail(messageFor(error, "처리하지 못했습니다."), submitted);
  }

  revalidateBoards();
  revalidatePath(`/admin/community/${parsed.data.communityId}`);
  return { ok: true, error: null };
}

export async function deleteCommunityAction(
  _prev: CommunityFormState,
  formData: FormData,
): Promise<CommunityFormState> {
  const actor = await requireAuth();

  const parsed = deleteCommunitySchema.safeParse({
    communityId: formData.get("communityId"),
    updatedAt: formData.get("updatedAt"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  try {
    await service.deleteCommunity(actor, parsed.data);
  } catch (error) {
    return fail(messageFor(error, "처리하지 못했습니다."));
  }

  revalidateBoards();
  revalidatePath(`/admin/community/${parsed.data.communityId}`);
  return { ok: true, error: null };
}
