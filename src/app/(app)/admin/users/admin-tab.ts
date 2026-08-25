/**
 * 계정 관리의 탭.
 *
 * 계정 · 초대 · 학생을 메뉴 세 줄로 갈라 두었더니, 셋이 같은 사람들을 다른
 * 각도로 보는 화면인데도 오갈 길이 사이드바밖에 없었다 — 초대가 계정이 되고,
 * 그 계정에 학급·번호가 붙는 한 흐름이다. 화면 안의 탭으로 고른다.
 *
 * 셋 다 교사 전용이라(`can.ts`의 user:manage · invite:list · student:manage)
 * 탭을 역할로 거를 일이 없다. 실제 접근 통제는 탭마다 제 권한으로 다시 한다.
 */

export const ADMIN_TABS = ["accounts", "invites", "students"] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

export const ADMIN_TAB_LABELS: Record<AdminTab, string> = {
  accounts: "계정",
  invites: "초대",
  students: "학생",
};

/** 주소에서 온 값. 모르는 값은 계정으로 떨어진다 — 화면이 비는 것보다 낫다. */
export function parseAdminTab(value: unknown): AdminTab {
  return typeof value === "string" && (ADMIN_TABS as readonly string[]).includes(value)
    ? (value as AdminTab)
    : "accounts";
}

/** 기본 탭은 주소에 싣지 않는다 — `/admin/users`가 곧 계정이다. */
export function adminTabParam(tab: AdminTab): string | null {
  return tab === "accounts" ? null : tab;
}
