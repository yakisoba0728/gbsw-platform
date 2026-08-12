/**
 * 시스템 역할.
 *
 * 교사와 관리자는 구분하지 않는다 — 교직원은 모두 ADMIN이며 권한이 동등하다.
 * 관리자끼리 서로를 초대할 수 있으므로 별도의 최상위 계정 개념도 두지 않는다.
 */
export const ROLES = ["ADMIN", "STUDENT", "PARENT"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "관리자",
  STUDENT: "학생",
  PARENT: "학부모",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
