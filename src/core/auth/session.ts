import { cache } from "react";
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
  /** 명단에서 빠져 소프트 삭제된 계정이면 삭제 시각. null이면 살아 있다. */
  deletedAt: Date | null;
  mustChangePassword: boolean;
};

/**
 * 지금 로그인한 사용자. 세션이 없으면 null.
 *
 * **한 요청 안에서는 한 번만 조회한다** (React cache) —
 * academic-year.service.ts의 getCurrentYear와 같은 규약이다. (app)/layout.tsx가
 * requireAuth()를 부르고 그 아래 페이지·서버액션이 다시 부르므로, 감싸지 않으면
 * 페이지를 한 번 그릴 때마다 세션 조회가 최소 두 번 돈다. 같은 요청 안에서
 * 세션이 바뀔 일은 없고, 요청이 끝나면 캐시도 함께 사라지므로 로그아웃·계정
 * 잠금 직후 다음 요청이 옛 값을 보는 일도 없다.
 */
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
   * true면 mustChangePassword여도 그대로 통과시킨다 (M12).
   *
   * /change-password의 페이지와 서버 액션만 이 옵션을 쓴다 — 강제 변경
   * 대기 상태를 풀 수 있는 유일한 경로이므로 자기 자신을 다시 튕겨내면
   * 리다이렉트 루프가 된다. 다른 곳에서 이 옵션을 켜면 강제 변경을 우회하는
   * 새 구멍이 생기므로 절대 따라 하면 안 된다.
   */
  allowMustChangePassword?: boolean;
};

/**
 * 로그인 필수. 세션이 없으면 /login으로 보낸다.
 *
 * 비활성화된 계정도 여기서 걸러진다. 관리자가 계정을 잠그면 세션을 지우지만,
 * 그 사이에 발급된 쿠키가 남아 있을 수 있으므로 매 요청 상태를 다시 확인한다.
 *
 * mustChangePassword도 여기서 가로챈다 (M12) — 예전엔 (app)/layout.tsx에만
 * 있어서, 강제 변경 대기 상태로도 서버 액션(페이지 트리를 안 거친다)을 직접
 * 호출할 수 있었다. requireAuth를 쓰는 모든 액션이 이 게이트를 함께 받는다.
 *
 * **cache()로 감싸지 않는다.** 이 함수의 값어치는 반환값이 아니라 redirect()라는
 * 부수효과에 있다 — redirect()는 Next 내부의 특수한 오류를 던져 렌더를 끊는데,
 * 그 "던진다"는 사실까지 캐시가 재생하리라 기대할 근거가 없다. 조회를 줄이는
 * 일은 위의 getSessionUser가 이미 하고 있으므로(같은 요청 안에서는 한 번),
 * 여기까지 감싸도 얻을 게 없고 게이트만 불투명해진다. requirePermission도 같다.
 */
export async function requireAuth(
  options?: RequireAuthOptions,
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // status(비활성)와 deletedAt(소프트 삭제)을 따로 검사한다 — auth.ts의 세션
  // 생성 훅과 같은 이유다. 훅이 로그인 자체를 막아도, 삭제되기 "전"에 이미
  // 발급된 세션 쿠키가 남아 있을 수 있으므로 여기서도 매 요청 다시 확인한다.
  if (user.status !== "ACTIVE" || user.deletedAt) redirect("/login?disabled=1");
  if (user.mustChangePassword && !options?.allowMustChangePassword) {
    redirect("/change-password");
  }
  return user;
}

/** 단일 액션 권한 게이트. 서비스 계층에서 can()으로 한 번 더 검사한다. */
export async function requirePermission(action: Action): Promise<SessionUser> {
  const user = await requireAuth();
  if (!can(user, action)) redirect("/forbidden");
  return user;
}
