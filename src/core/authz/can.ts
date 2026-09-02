import type { Role } from "./roles";

// ADMIN은 모든 액션 허용. 소유권과 게시판별 접근 권한은 각 서비스에서 검사한다.
export const RULES = {
  "user:manage": [],
  "student:manage": [],
  "academic-year:manage": [],
  "invite:create": [],
  "invite:list": [],
  "invite:revoke": [],
  "audit:read": [],

  "community:manage": [],
  "community:moderate": [],

  "merit:rule:manage": [],
  "merit:rule:read": ["STUDENT", "PARENT"],
  "merit:threshold:manage": [],
  "merit:award": [],
  "merit:cancel": [],
  "merit:read:any": [],

  "pass:approve": [],
  "pass:issue": [],
  "pass:cancel": [],
  "pass:read:any": [],

  "pass:request": ["STUDENT"],
  "pass:consent": ["PARENT"],

  "pass:verify": ["STUDENT", "PARENT"],

  "invite:create:parent": ["STUDENT"],
} satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof RULES;

export function can(
  user: { role?: string | null } | null | undefined,
  action: Action,
): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const allowed: readonly Role[] | undefined = RULES[action];
  if (!allowed) return false;

  return allowed.includes(user.role as Role);
}
