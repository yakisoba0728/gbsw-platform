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
  | "merit:read:any"
  | "pass:request"
  | "pass:consent"
  | "pass:verify"
  | "pass:approve"
  | "pass:issue"
  | "pass:cancel"
  | "pass:read:any";

/**
 * 액션별 허용 역할. ADMIN은 can()이 무조건 통과시켜 여기 없고, 빈 배열은
 * 교사 전용이다. export하는 이유는 can.test.ts가 표 전체를 대조해서다 (M13).
 */
export const RULES: Record<Action, Role[]> = {
  "user:manage": [], // 교사 전용
  "student:manage": [], // 교사 전용
  "academic-year:manage": [], // 교사 전용
  "invite:create": [], // 교사 전용
  "invite:list": [], // 교사 전용
  "invite:revoke": [], // 교사 전용
  "audit:read": [], // 교사 전용

  // 상벌점 — 다섯 다 교사 전용. 취소를 "자기가 준 것만"으로 좁히지 않는다:
  // 교직원 사이에 권한 차등이 없어 소유권 검사의 근거가 없다.
  "merit:rule:manage": [],
  // 벌점 경고·위험 기준. 읽기는 권한을 걸지 않는다 — 통제하는 것은 바꾸는 일뿐이다.
  "merit:threshold:manage": [],
  "merit:award": [],
  "merit:cancel": [],
  "merit:read:any": [],

  // 전자출입증 — 결재 계열 넷은 교사 전용.
  "pass:approve": [],
  "pass:issue": [],
  "pass:cancel": [],
  "pass:read:any": [],

  // 아래 셋도 소유권 검사가 따라붙는다 — request는 세션→StudentProfile,
  // consent는 세션→ParentStudent→학생이다.
  "pass:request": ["STUDENT"],
  "pass:consent": ["PARENT"],

  // 판정은 역할로 가르지 않는다. 살아 있는 QR을 손에 쥐었다는 것은 학생 화면
  // 앞에 서 있다는 뜻이고, 나오는 것도 이름·학번·유형·유효 시각뿐이다
  // (사유·행선지는 pass:read:any에게만).
  "pass:verify": ["STUDENT", "PARENT"],

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
