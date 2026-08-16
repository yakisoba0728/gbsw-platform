"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutIcon } from "@/components/icons";
import { authClient } from "@/core/auth/auth-client";
import type { Role } from "@/core/authz/roles";
import { ROLE_LABELS } from "@/core/authz/roles";
import { MobileNav } from "./mobile-nav";
import { titleForPath } from "./nav";

export function Topbar({
  name,
  role,
}: {
  name: string;
  role: Role | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const title = titleForPath(pathname);
  const initial = name.trim().slice(0, 1) || "?";

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 flex-none items-center justify-between border-b border-line bg-surface px-[18px] lg:h-[62px] lg:px-7">
      <div className="flex min-w-0 items-center gap-2.5">
        {/*
         * 좁은 화면에서는 로고 자리를 메뉴 버튼이 대신한다 — 390px 폭에 로고와
         * 버튼을 둘 다 두면 제목이 잘린다. 로고는 서랍 머리와 데스크톱
         * 사이드바에 그대로 남는다.
         */}
        <MobileNav role={role} />
        <h1 className="truncate text-base font-extrabold tracking-[-0.01em] text-ink lg:text-lg">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-right sm:block">
          <span className="block text-[13px] font-semibold text-ink">
            {name}
          </span>
          {role && (
            <span className="block text-[11px] text-mut">
              {ROLE_LABELS[role]}
            </span>
          )}
        </span>

        <span
          className="flex size-[30px] items-center justify-center rounded-full bg-pri-soft text-xs font-bold text-pri"
          aria-hidden
        >
          {initial}
        </span>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          title="로그아웃"
          className="rounded-btn p-2 text-mut transition-colors hover:bg-soft hover:text-ink disabled:opacity-50"
        >
          <LogoutIcon size={18} />
          <span className="sr-only">로그아웃</span>
        </button>
      </div>
    </header>
  );
}
