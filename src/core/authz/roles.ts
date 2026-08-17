/** 교사와 관리자를 구분하지 않는다 — 교직원은 모두 ADMIN이고 권한이 동등하다. */
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
