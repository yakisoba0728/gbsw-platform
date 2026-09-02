"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoutIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { authClient } from "@/core/auth/auth-client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setSigningOut(false);
        return;
      }
    } catch {
      setSigningOut(false);
      return;
    }
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
