"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutIcon } from "@/components/icons";
import { authClient } from "@/core/auth/auth-client";
import type { Role } from "@/core/authz/roles";
import { honorificSuffix } from "@/core/authz/roles";
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

      {/* 제목이 이 줄의 유일한 초점이다. 오른쪽은 "지금 누구로 들어와 있나"만 답한다 —
          직급 줄도 이니셜 동그라미도 두지 않는다(호칭이 직급을 말하고, 이름이 들어갈
          자리를 한 글자가 차지하고 있었다).
          대신 한 줄 안에서 이름과 호칭의 굵기를 가른다. 이름이 신원이고 호칭은 부르는
          격이라, 둘을 같은 회색으로 뭉치면 문자열 하나로 읽힌다. */}
      <div className="flex min-w-0 items-center">
        <span className="truncate text-caption">
          <span className="font-medium text-ink">{name}</span>
          <span className="text-mut">{honorificSuffix(role)}</span>
        </span>

        <span className="mx-2 h-4 w-px shrink-0 bg-line" aria-hidden />

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
