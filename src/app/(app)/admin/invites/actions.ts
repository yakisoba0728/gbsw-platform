"use server";

import { revalidatePath } from "next/cache";
import { defineFormAction } from "@/lib/action";
import { text } from "@/lib/action-message";
import { formatInviteCode } from "@/modules/invites/invite-code";
import {
  createAdminInviteSchema,
  createParentInviteForSchema,
  createStudentInviteSchema,
  revokeInviteSchema,
} from "@/modules/invites/invite.schema";
import {
  createAdminInvite,
  createParentInviteFor,
  createStudentInvite,
  InviteError,
  MAX_ACTIVE_PARENT_INVITES,
  revokeInvite,
} from "@/modules/invites/invite.service";
import type {
  InviteFormState,
  InviteFormValues,
  RevokeState,
} from "./action-state";

export type { InviteFormState, InviteFormValues, RevokeState };

const MESSAGES = {
  FORBIDDEN: "권한이 없습니다.",
  CODE_GENERATION_FAILED: "코드를 만들지 못했습니다. 다시 시도해 주세요.",
  TOO_MANY_ACTIVE_INVITES: `이 학생에게 쓰지 않은 코드가 ${MAX_ACTIVE_PARENT_INVITES}개 있습니다.`,
  STUDENT_NOT_FOUND: "학생을 찾을 수 없습니다.",
  NOT_FOUND: "코드를 찾을 수 없습니다.",
  NOT_PENDING: "이미 쓰였거나 폐기된 코드입니다.",
} satisfies Record<string, string>;

function optionalDays(value: FormDataEntryValue | null): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  return Number(raw);
}

function submittedValues(formData: FormData): InviteFormValues {
  return {
    name: text(formData, "name"),
    birthDate: text(formData, "birthDate"),
    grade: text(formData, "grade"),
    classNo: text(formData, "classNo"),
    number: text(formData, "number"),
    expiresInDays: text(formData, "expiresInDays"),
  };
}

export const createStudentInviteAction = defineFormAction<InviteFormState>()({
  schema: createStudentInviteSchema,
  input: (formData) => ({
    name: formData.get("name"),
    birthDate: formData.get("birthDate"),
    grade: Number(formData.get("grade")),
    classNo: Number(formData.get("classNo")),
    number: Number(formData.get("number")),
    expiresInDays: optionalDays(formData.get("expiresInDays")),
  }),
  failState: (error, formData) => ({
    error,
    code: null,
    values: submittedValues(formData),
  }),
  run: async (actor, data) => {
    const invite = await createStudentInvite(actor, data);
    revalidatePath("/admin/users");
    return { error: null, code: formatInviteCode(invite.code) };
  },
  errorClass: InviteError,
  messages: MESSAGES,
  logPrefix: "[invite]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "코드를 발급하지 못했습니다.",
});

export const createAdminInviteAction = defineFormAction<InviteFormState>()({
  schema: createAdminInviteSchema,
  input: (formData) => ({
    name: formData.get("name"),
    expiresInDays: optionalDays(formData.get("expiresInDays")),
  }),
  failState: (error, formData) => ({
    error,
    code: null,
    values: {
      name: text(formData, "name"),
      expiresInDays: text(formData, "expiresInDays"),
    },
  }),
  run: async (actor, data) => {
    const invite = await createAdminInvite(actor, data);
    revalidatePath("/admin/users");
    return { error: null, code: formatInviteCode(invite.code) };
  },
  errorClass: InviteError,
  messages: MESSAGES,
  logPrefix: "[invite]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "코드를 발급하지 못했습니다.",
});

export const createParentInviteForAction = defineFormAction<InviteFormState>()({
  schema: createParentInviteForSchema,
  input: (formData) => ({
    studentId: formData.get("studentId"),
    name: formData.get("name"),
    expiresInDays: optionalDays(formData.get("expiresInDays")),
  }),
  failState: (error, formData) => ({
    error,
    code: null,
    values: {
      studentId: text(formData, "studentId"),
      name: text(formData, "name"),
      expiresInDays: text(formData, "expiresInDays"),
    },
  }),
  run: async (actor, data) => {
    const invite = await createParentInviteFor(actor, data);
    revalidatePath("/admin/users");
    return { error: null, code: formatInviteCode(invite.code) };
  },
  errorClass: InviteError,
  messages: MESSAGES,
  logPrefix: "[invite]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "코드를 발급하지 못했습니다.",
});

export const revokeInviteAction = defineFormAction<RevokeState>()({
  schema: revokeInviteSchema,
  input: (formData) => ({
    inviteId: formData.get("inviteId"),
    reason: formData.get("reason"),
  }),
  failState: (error) => ({ ok: false, error }),
  run: async (actor, data) => {
    await revokeInvite(actor, data);
    revalidatePath("/admin/users");
    revalidatePath("/parent-invite");
    return { ok: true, error: null };
  },
  errorClass: InviteError,
  messages: MESSAGES,
  logPrefix: "[invite]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "폐기하지 못했습니다.",
});
