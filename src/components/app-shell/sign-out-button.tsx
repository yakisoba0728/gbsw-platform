"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoutIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { authClient } from "@/core/auth/auth-client";

/**
 * 로그아웃. 사이드바 바닥과 상단바(사이드바가 없는 폭)가 같은 것을 쓴다 —
 * 두 곳이 각자 `authClient.signOut()`을 부르면 한쪽만 `router.refresh()`를
 * 빠뜨려도 아무도 모른다(서버 컴포넌트가 옛 세션으로 남는다).
 */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      variant="quiet"
      size="icon"
      onClick={handleSignOut}
      disabled={signingOut}
      title="로그아웃"
      className={className}
    >
      <LogoutIcon size={18} />
      <span className="sr-only">로그아웃</span>
    </Button>
  );
}
