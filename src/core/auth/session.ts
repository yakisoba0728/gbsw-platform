import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Action } from "@/core/authz/can";
import { isRole, type Role } from "@/core/authz/roles";
import { auth } from "./auth";

/**
 * 앱 전체가 쓰는 좁은 세션 사용자 타입.
 * Better Auth의 추론 타입이 앱 코드로 새어나가지 않게 여기서 한 번 정규화한다.
 */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  status: string | null;
  mustChangePassword: boolean;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: isRole(user.role) ? user.role : null,
    status: user.status ?? null,
    mustChangePassword: user.mustChangePassword ?? false,
  };
}

/**
 * 로그인 필수. 세션이 없으면 /login으로 보낸다.
 *
 * 비활성화된 계정도 여기서 걸러진다. 관리자가 계정을 잠그면 세션을 지우지만,
 * 그 사이에 발급된 쿠키가 남아 있을 수 있으므로 매 요청 상태를 다시 확인한다.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.status !== "ACTIVE") redirect("/login?disabled=1");
  return user;
}

/** 단일 액션 권한 게이트. 서비스 계층에서 can()으로 한 번 더 검사한다. */
export async function requirePermission(action: Action): Promise<SessionUser> {
  const user = await requireAuth();
  if (!can(user, action)) redirect("/forbidden");
  return user;
}
