import type { Role } from "./roles";

/**
 * 권한 액션. 형식은 `"<모듈>:<동작>"`.
 *
 * 새 모듈을 추가할 때 여기에 액션을 등록하고, 아래 RULES와
 * tests/core/authz/can.test.ts에 케이스를 함께 추가한다.
 */
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
  | "merit:award"
  | "merit:cancel"
  | "merit:read:any";

/**
 * 액션별 허용 역할.
 *
 * ADMIN은 여기 등장하지 않는다 — can()에서 무조건 통과시킨다.
 * 빈 배열은 "관리자 전용"이라는 뜻이며, 나중에 역할이 추가돼도
 * 실수로 열리지 않도록 명시적으로 비워둔다.
 *
 * export한다 (M13) — tests/core/authz/can.test.ts가
 * `Object.keys(RULES)`와 EXPECTED를 대조해 "모든 액션이 표에 있다"는
 * 주석을 실제 테스트로 확인한다.
 */
export const RULES: Record<Action, Role[]> = {
  "user:manage": [], // 관리자 전용
  "student:manage": [], // 관리자 전용
  "academic-year:manage": [], // 관리자 전용
  "invite:create": [], // 관리자 전용
  "invite:list": [], // 관리자 전용
  "invite:revoke": [], // 관리자 전용
  "audit:read": [], // 관리자 전용

  // 상벌점 — 넷 다 관리자 전용이다.
  // 취소를 "자기가 준 것만"으로 좁히지 않는다: 교직원 사이에 권한 차등이 없으므로
  // 등급 없는 소유권 검사는 근거가 없고, 준 사람이 출장·퇴직이면 잘못된 기록을
  // 아무도 못 고치게 된다. 책임 추적은 필수 사유 + 이름 스냅샷 + 감사로그가 맡는다.
  "merit:rule:manage": [],
  "merit:award": [],
  "merit:cancel": [],
  "merit:read:any": [],

  // 학생은 자기 학부모 코드만 만들 수 있다.
  // 역할 검사만으로는 부족해서 서비스에서 소유권(세션→StudentProfile)을 함께 검사한다.
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
