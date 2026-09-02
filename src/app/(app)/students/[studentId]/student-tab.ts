import type { Action } from "@/core/authz/can";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";

export const STUDENT_TABS = ["merit", "pass", "profile"] as const;

export type StudentTab = (typeof STUDENT_TABS)[number];

export const STUDENT_TAB_LABELS: Record<StudentTab, string> = {
  merit: "상벌점",
  pass: "출입증",
  profile: "학생 정보",
};

export const STUDENT_TAB_ACTIONS: Record<StudentTab, Action> = {
  merit: "merit:read:any",
  pass: "pass:read:any",
  profile: "student:manage",
};

export function parseStudentTab(value: unknown): StudentTab {
  return typeof value === "string" && (STUDENT_TABS as readonly string[]).includes(value)
    ? (value as StudentTab)
    : "merit";
}

export function studentTabParam(tab: StudentTab): string | null {
  return tab === "merit" ? null : tab;
}

export function studentHref(
  studentId: string,
  params: SearchParamsInput,
  patch: Record<string, string | null> = {},
): string {
  return hrefWith(`/students/${studentId}`, params, patch);
}
