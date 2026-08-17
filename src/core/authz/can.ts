import type { Role } from "./roles";

/** 권한 액션 `"<모듈>:<동작>"`. 새 액션은 RULES와 can.test.ts에도 함께 넣는다. */
export type Action =
  | "user:manage"
  | "student:manage"
  | "academic-year:manage"
  | "invite:create"
  | "invite:list"
  | "invite:revoke"
  | "invite:create:parent"
  | "audit:read"
  | "merit:rule:manage"
  | "merit:threshold:manage"
  | "merit:award"
  | "merit:cancel"
  | "merit:read:any";

/**
 * 액션별 허용 역할. ADMIN은 can()이 무조건 통과시켜 여기 없고, 빈 배열은
 * 관리자 전용이다. export하는 이유는 can.test.ts가 표 전체를 대조해서다 (M13).
 */
export const RULES: Record<Action, Role[]> = {
  "user:manage": [], // 관리자 전용
  "student:manage": [], // 관리자 전용
  "academic-year:manage": [], // 관리자 전용
  "invite:create": [], // 관리자 전용
  "invite:list": [], // 관리자 전용
  "invite:revoke": [], // 관리자 전용
  "audit:read": [], // 관리자 전용

  // 상벌점 — 다섯 다 관리자 전용. 취소를 "자기가 준 것만"으로 좁히지 않는다:
  // 교직원 사이에 권한 차등이 없어 소유권 검사의 근거가 없다.
  "merit:rule:manage": [],
  // 벌점 경고·위험 기준. 읽기는 권한을 걸지 않는다 — 통제하는 것은 바꾸는 일뿐이다.
  "merit:threshold:manage": [],
  "merit:award": [],
  "merit:cancel": [],
  "merit:read:any": [],

  // 역할만으로 부족해 서비스가 소유권(세션→StudentProfile)을 함께 검사한다.
  "invite:create:parent": ["STUDENT"],
};

export function can(
  user: { role?: string | null } | null | undefined,
  action: Action,
): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const allowed = RULES[action];
  if (!allowed) return false;

  return allowed.includes(user.role as Role);
}
