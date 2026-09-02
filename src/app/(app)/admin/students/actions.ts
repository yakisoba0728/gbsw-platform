"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import {
  AcademicYearError,
  createYear,
  setCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import { yearFormSchema } from "@/modules/academic-year/academic-year.schema";
import {
  EnrollmentError,
  saveEnrollments,
} from "@/modules/enrollment/enrollment.service";
import { saveEnrollmentsSchema } from "@/modules/enrollment/enrollment.schema";
import type { SaveState, YearState } from "./action-state";

const MESSAGES: Record<string, string> = {
  UNKNOWN_STUDENT: "명단에 없는 학생이 있습니다. 새로고침 후 다시 저장해 주세요.",
  INCOMPLETE_ENROLLED: "재학이면 학년·반·번호를 모두 채워야 합니다.",
  NUMBER_TAKEN: "같은 반에 같은 번호가 있습니다.",
  YEAR_MISMATCH: "학년도가 바뀌었습니다. 새로고침 후 다시 저장해 주세요.",
  ENROLLMENT_CHANGED:
    "다른 교사가 학생 정보를 바꿨습니다. 새로고침 후 다시 저장해 주세요.",
  CANNOT_DEACTIVATE_SELF: "자기 계정은 비활성화할 수 없습니다.",
};

export async function saveEnrollmentsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const actor = await requireAuth();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(String(formData.get("changes") ?? "[]"));
  } catch {
    return { error: "저장할 내용을 읽지 못했습니다.", saved: null };
  }

  const parsed = saveEnrollmentsSchema.safeParse({
    changes: parsedJson,
    year: formData.get("year"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
      saved: null,
    };
  }

  try {
    const { saved } = await saveEnrollments(
      actor,
      parsed.data.changes,
      parsed.data.year,
    );
    revalidatePath("/admin/students");
    return { error: null, saved };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "이 작업을 할 권한이 없습니다.", saved: null };
    }
    if (error instanceof EnrollmentError) {
      return {
        error: error.detail ?? MESSAGES[error.message] ?? "저장하지 못했습니다.",
        saved: null,
      };
    }
    console.error("[enrollment] 소속을 저장하지 못했습니다.", error);
    return { error: "저장하지 못했습니다.", saved: null };
  }
}

export async function setCurrentYearAction(
  _prev: YearState,
  formData: FormData,
): Promise<YearState> {
  const actor = await requireAuth();

  const parsed = yearFormSchema.safeParse({ year: formData.get("year") });
  if (!parsed.success) {
    return { error: "학년도가 올바르지 않습니다.", ok: false };
  }

  try {
    await setCurrentYear(actor, parsed.data.year);
    revalidatePath("/admin/students");
    return { error: null, ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "이 작업을 할 권한이 없습니다.", ok: false };
    }
    console.error("[academic-year] 현재 학년도를 바꾸지 못했습니다.", error);
    return { error: "현재 학년도를 바꾸지 못했습니다.", ok: false };
  }
}

export async function createYearAction(
  _prev: YearState,
  formData: FormData,
): Promise<YearState> {
  const actor = await requireAuth();

  const parsed = yearFormSchema.safeParse({ year: formData.get("year") });
  if (!parsed.success) {
    return { error: "학년도가 올바르지 않습니다.", ok: false };
  }

  try {
    await createYear(actor, parsed.data.year);
    revalidatePath("/admin/students");
    return { error: null, ok: true };
  } catch (error) {
    if (error instanceof AcademicYearError) {
      if (error.message === "YEAR_TAKEN") {
        return { error: "이미 있는 학년도입니다.", ok: false };
      }
      return { error: "학년도가 올바르지 않습니다.", ok: false };
    }
    if (error instanceof ForbiddenError) {
      return { error: "이 작업을 할 권한이 없습니다.", ok: false };
    }
    console.error("[academic-year] 학년도를 만들지 못했습니다.", error);
    return { error: "학년도를 만들지 못했습니다.", ok: false };
  }
}
