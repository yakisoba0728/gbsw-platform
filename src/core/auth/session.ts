import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type Action } from "@/core/authz/can";
import { assertCan, ForbiddenError } from "@/core/authz/errors";
import { isRole, type Role } from "@/core/authz/roles";
import { auth } from "./auth";

/** Better Auth의 추론 타입이 앱 코드로 새지 않게 여기서 한 번 정규화한다. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  status: string | null;
  /** 명단에서 빠져 소프트 삭제된 계정이면 삭제 시각. null이면 살아 있다. */
  deletedAt: Date | null;
  mustChangePassword: boolean;
};

/** 지금 로그인한 사용자. 한 요청 안에서는 한 번만 조회한다 (React cache). */
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

export type RequireAuthOptions = {
  /**
   * true면 mustChangePassword여도 통과시킨다 (M12). /change-password만 쓴다 —
   * 다른 곳에서 켜면 강제 변경을 우회하는 구멍이 생긴다.
   */
  allowMustChangePassword?: boolean;
};

/**
 * 로그인 필수. 중지·삭제된 계정과 mustChangePassword도 여기서 가로챈다 (M12).
 * cache()로 감싸지 않는다 — redirect()가 던지는 것까지 캐시가 재생하지 않는다.
 */
export async function requireAuth(
  options?: RequireAuthOptions,
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // 훅이 로그인을 막아도 그 전에 발급된 쿠키가 남으므로 매 요청 다시 본다.
  if (user.status !== "ACTIVE" || user.deletedAt) redirect("/login?disabled=1");
  if (user.mustChangePassword && !options?.allowMustChangePassword) {
    redirect("/change-password");
  }
  return user;
}

/**
 * 단일 액션 권한 게이트. 서비스 계층에서 can()으로 한 번 더 검사한다.
 *
 * 거부는 `assertCan`을 거쳐 감사로그에 남긴다. 페이지가 먼저 막기 때문에
 * 학생이 교사 화면 주소를 눌러 본 흔적이 서비스 쪽 `authz:denied`에는 한 줄도
 * 안 남고 있었다 — 서비스에 닿기 전에 리다이렉트가 먼저 일어나서다.
 * 판정과 기록을 한곳에 둔다는 규칙이 이 경로에도 적용된다.
 */
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
