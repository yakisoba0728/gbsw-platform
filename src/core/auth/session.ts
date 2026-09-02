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
  if (!user) redirect("/login");
  // 비활성화 전에 발급된 세션도 차단한다.
  if (isLoginBlocked(user)) redirect("/login?disabled=1");
  if (user.mustChangePassword && !options?.allowMustChangePassword) {
    redirect("/change-password");
  }
  return user;
}

export async function requirePermission(action: Action): Promise<SessionUser> {
  const user = await requireAuth();

  try {
    await assertCan(user, action);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/forbidden");
    throw error;
  }

  return user;
}
