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

/**
 * 사람을 부를 때 쓰는 이름. 역할마다 호칭이 다르다.
 *
 * 「님」만 이름에 붙여 쓴다 — 의존명사라 그게 맞는 표기이고, 「선생님」·「학부모님」은
 * 그 자체가 단어라 띄운다. 역할을 모르면(계정이 지워진 감사로그 등) 「님」으로 떨어진다.
 */
export function honorificName(
  name: string,
  role: Role | null | undefined,
): string {
  if (role === "ADMIN") return `${name} 선생님`;
  if (role === "PARENT") return `${name} 학부모님`;
  return `${name}님`;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
