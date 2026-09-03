"use server";

import { revalidatePath } from "next/cache";
import { defineFormAction, ActionInputError } from "@/lib/action";
import { yearFormSchema } from "@/modules/academic-year/academic-year.schema";
import {
  AcademicYearError,
  createYear,
  setCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import {
  EnrollmentError,
  saveEnrollments,
} from "@/modules/enrollment/enrollment.service";
import { saveEnrollmentsSchema } from "@/modules/enrollment/enrollment.schema";
import type { SaveState, YearState } from "./action-state";

const MESSAGES: Record<string, string> & { FORBIDDEN: string } = {
  FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  UNKNOWN_STUDENT: "명단에 없는 학생이 있습니다. 새로고침 후 다시 저장해 주세요.",
  INCOMPLETE_ENROLLED: "재학이면 학년·반·번호를 모두 채워야 합니다.",
  NUMBER_TAKEN: "같은 반에 같은 번호가 있습니다.",
  YEAR_MISMATCH: "학년도가 바뀌었습니다. 새로고침 후 다시 저장해 주세요.",
  ENROLLMENT_CHANGED:
    "다른 교사가 학생 정보를 바꿨습니다. 새로고침 후 다시 저장해 주세요.",
  CANNOT_DEACTIVATE_SELF: "자기 계정은 비활성화할 수 없습니다.",
};

export const saveEnrollmentsAction = defineFormAction<SaveState>()({
  schema: saveEnrollmentsSchema,
  input: (formData) => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(String(formData.get("changes") ?? "[]"));
    } catch {
      throw new ActionInputError("저장할 내용을 읽지 못했습니다.");
    }
    return {
      changes: parsedJson,
      year: formData.get("year"),
    };
  },
  failState: (error) => ({ error, saved: null }),
  // detail이 있으면 사전보다 그 문장이 우선한다.
  onError: (error) => {
    if (error instanceof EnrollmentError) {
      return error.detail ?? MESSAGES[error.message] ?? "저장하지 못했습니다.";
    }
    return null;
  },
  run: async (actor, data) => {
    const { saved } = await saveEnrollments(actor, data.changes, data.year);
    revalidatePath("/admin/students");
    return { error: null, saved };
  },
  errorClass: EnrollmentError,
  messages: MESSAGES,
  logPrefix: "[enrollment]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "저장하지 못했습니다.",
});

export const setCurrentYearAction = defineFormAction<YearState>()({
  schema: yearFormSchema,
  input: (formData) => ({ year: formData.get("year") }),
  failState: (error) => ({ error, ok: false }),
  run: async (actor, data) => {
    await setCurrentYear(actor, data.year);
    revalidatePath("/admin/students");
    return { error: null, ok: true };
  },
  errorClass: AcademicYearError,
  messages: {
    FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  },
  logPrefix: "[academic-year]",
  invalidInputMessage: "학년도가 올바르지 않습니다.",
  failureMessage: "현재 학년도를 바꾸지 못했습니다.",
});

export const createYearAction = defineFormAction<YearState>()({
  schema: yearFormSchema,
  input: (formData) => ({ year: formData.get("year") }),
  failState: (error) => ({ error, ok: false }),
  onError: (error) => {
    if (error instanceof AcademicYearError) {
      if (error.message === "YEAR_TAKEN") return "이미 있는 학년도입니다.";
      return "학년도가 올바르지 않습니다.";
    }
    return null;
  },
  run: async (actor, data) => {
    await createYear(actor, data.year);
    revalidatePath("/admin/students");
    return { error: null, ok: true };
  },
  errorClass: AcademicYearError,
  messages: {
    FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  },
  logPrefix: "[academic-year]",
  invalidInputMessage: "학년도가 올바르지 않습니다.",
  failureMessage: "학년도를 만들지 못했습니다.",
});
