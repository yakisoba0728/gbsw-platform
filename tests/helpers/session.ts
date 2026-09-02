import type { SessionUser } from "@/core/auth/session";

type UserOverride = Partial<Omit<SessionUser, "id" | "role">>;

export function user(
  role: SessionUser["role"],
  id: string,
  over: UserOverride = {},
): SessionUser {
  return {
    id,
    name: "테스트",
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
    ...over,
  };
}
