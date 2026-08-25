/** 교직원 사이에 권한 차등이 없다 — 전원 ADMIN이고, 화면에서는 「교사」로 부른다. */
export const ROLES = ["ADMIN", "STUDENT", "PARENT"] as const;

export type Role = (typeof ROLES)[number];

/**
 * 화면에 쓰는 역할 이름. 코드 상수는 ADMIN이지만 학교에서 그 자리는 교사다 —
 * 「관리자」는 시스템 운영자처럼 읽혀 교무실에서 쓰는 말과 어긋난다.
 */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "교사",
  STUDENT: "학생",
  PARENT: "학부모",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
