"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutIcon } from "@/components/icons";
import { authClient } from "@/core/auth/auth-client";
import type { Role } from "@/core/authz/roles";
import { honorificName } from "@/core/authz/roles";
import { MobileNav } from "./mobile-nav";
import { titleForPath } from "./nav";

export function Topbar({ name, role }: { name: string; role: Role | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const title = titleForPath(pathname);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    // print:hidden — 확인서 화면이 자기 <h1>을 그린다. 빼지 않으면 제목이 둘 찍힌다.
    <header className="flex h-14 flex-none items-center justify-between border-b border-line bg-surface px-4 lg:h-15 lg:px-7 print:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* 390px 폭에 로고와 메뉴 버튼을 둘 다 두면 제목이 잘린다. */}
        <MobileNav role={role} />
        <h1 className="truncate text-base font-semibold tracking-tight text-ink lg:text-lg">
          {title}
        </h1>
      </div>

      {/* 제목이 이 줄의 유일한 초점이다. 오른쪽은 "지금 누구로 들어와 있나"만 조용히
          답하면 되므로 한 줄·흐린 글자로 둔다. 직급은 붙이지 않는다 — 호칭이 이미
          말하고, 대시보드가 역할을 따로 적는다. 이니셜 동그라미도 없앴다: 이름이
          들어갈 자리를 한 글자가 차지하고 있었다. */}
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-caption text-mut">
          {honorificName(name, role)}
        </span>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          title="로그아웃"
          className="shrink-0 rounded-btn p-2.5 text-mut transition-colors hover:bg-soft hover:text-ink disabled:opacity-40"
        >
          <LogoutIcon size={18} />
          <span className="sr-only">로그아웃</span>
        </button>
      </div>
    </header>
  );
}
