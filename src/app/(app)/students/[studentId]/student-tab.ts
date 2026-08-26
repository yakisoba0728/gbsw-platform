import type { Action } from "@/core/authz/can";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";

/**
 * 학생 상세의 갈래.
 *
 * 상벌점과 출입증이 서로 다른 화면에 흩어져 있어, 「김민준」을 보려면 화면을
 * 두 번 옮겨야 했다 — 같은 사람의 다른 면인데 그 사람이 화면 밖에 있었다.
 * 한 주소에 모으고 `?tab=`으로 고른다 (통계 네 갈래의 `?view=`와 같은 규칙).
 */
export const STUDENT_TABS = ["merit", "pass", "profile"] as const;

export type StudentTab = (typeof STUDENT_TABS)[number];

export const STUDENT_TAB_LABELS: Record<StudentTab, string> = {
  merit: "상벌점",
  pass: "출입증",
  profile: "학생 정보",
};

/**
 * 탭마다 필요한 권한. **셋을 하나로 묶지 않는다** — 지금은 셋 다 교사 전용이라
 * 결과가 같지만, 한쪽만 여는 날 이 구분이 없으면 화면이 통째로 막힌다.
 * 막힌 탭은 목록에서 빠지고 나머지는 그대로 선다.
 */
export const STUDENT_TAB_ACTIONS: Record<StudentTab, Action> = {
  merit: "merit:read:any",
  pass: "pass:read:any",
  profile: "student:manage",
};

/** 주소에서 온 값. 모르는 값은 상벌점으로 떨어진다 — 화면이 비는 것보다 낫다. */
export function parseStudentTab(value: unknown): StudentTab {
  return typeof value === "string" && (STUDENT_TABS as readonly string[]).includes(value)
    ? (value as StudentTab)
    : "merit";
}

/** 기본 갈래는 주소에 싣지 않는다 — `/students/<id>`가 곧 상벌점이다. */
export function studentTabParam(tab: StudentTab): string | null {
  return tab === "merit" ? null : tab;
}

/**
 * 지금 쿼리를 유지한 채 일부만 바꾼 주소. 갈래 탭·트랙 탭·학년도 칩이 함께 쓴다 —
 * 갈래를 옮겨도 트랙과 학년도는 들고 간다.
 */
export function studentHref(
  studentId: string,
  params: SearchParamsInput,
  patch: Record<string, string | null> = {},
): string {
  return hrefWith(`/students/${studentId}`, params, patch);
}
