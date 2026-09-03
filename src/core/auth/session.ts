import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type Action } from "@/core/authz/can";
import { assertCan, ForbiddenError } from "@/core/authz/errors";
import { isRole, type Role } from "@/core/authz/roles";
import { auth } from "./auth";
import { isLoginBlocked } from "./login-eligibility";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  status: string | null;
  deletedAt: Date | null;
  mustChangePassword: boolean;
};

/** core 세션 가드가 리다이렉트할 때 쓰는 앱 라우트 — core의 라우팅 의존을
    한 곳에 모아 하드코딩이 흩어지지 않게 한다. */
export const REDIRECT_ROUTES = {
  login: "/login",
  loginDisabled: "/login?disabled=1",
  changePassword: "/change-password",
  forbidden: "/forbidden",
} as const;

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: isRole(user.role) ? user.role : null,
    status: user.status ?? null,
    deletedAt: user.deletedAt ?? null,
    mustChangePassword: user.mustChangePassword ?? false,
  };
});

export async function requireAuth(
  options?: { allowMustChangePassword?: boolean },
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(REDIRECT_ROUTES.login);
  // 비활성화 전에 발급된 세션도 차단한다.
  if (isLoginBlocked(user)) redirect(REDIRECT_ROUTES.loginDisabled);
  if (user.mustChangePassword && !options?.allowMustChangePassword) {
    redirect(REDIRECT_ROUTES.changePassword);
  }
  return user;
}

export async function requirePermission(action: Action): Promise<SessionUser> {
  const user = await requireAuth();

  try {
    await assertCan(user, action);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect(REDIRECT_ROUTES.forbidden);
    throw error;
  }

  return user;
}
