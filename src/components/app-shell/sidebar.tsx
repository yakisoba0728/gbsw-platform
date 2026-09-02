"use client";

import Image from "next/image";
import type { Role } from "@/core/authz/roles";
import { honorificSuffix } from "@/core/authz/roles";
import { TruncatedText } from "@/components/ui/truncated-text";
import { SignOutButton } from "./sign-out-button";
import { NavTree } from "./nav-tree";

export function Sidebar({ name, role }: { name: string; role: Role | null }) {
  return (
    <aside className="hidden w-60 flex-none flex-col border-r border-line bg-surface px-3 py-5 lg:flex print:hidden">
      <div className="flex items-center gap-2.5 px-3 pb-6">
        <Image src="/brand/gbsw-logo.webp" alt="" width={30} height={30} />
        <span>
          <span className="block text-sm font-semibold tracking-tight text-ink">
            GBSW
          </span>
          <span className="block text-xs text-mut">통합관리시스템</span>
        </span>
      </div>

      {/* 메뉴가 길어지면 여기서만 스크롤한다 — aside 전체가 흐르면 계정 블록이
          바닥에서 떨어져 나간다. */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        <NavTree density="sidebar" expand="in-group" role={role} />
      </nav>

      {/*
       * 계정은 사이드바 바닥이다. 상단바에 두면 그 줄이 「제목 · 시각 · 이름 ·
       * 나가기」로 넷이 되어 무엇이 제목인지 흐려지고, 사이드바는 마지막 메뉴
       * 아래로 빈 채 끝난다. 하루 종일 켜 두는 도구에서 「지금 누구인가」는 늘
       * 같은 자리에 있어야 하고, 그 자리는 메뉴 옆이다.
       *
       * **폰에는 사이드바가 없다.** 그쪽은 상단바가 같은 것을 그린다.
       */}
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <TruncatedText
          full={`${name}${honorificSuffix(role)}`}
          className="min-w-0 flex-1 px-3 text-caption"
        >
          <span className="font-medium text-ink">{name}</span>
          <span className="text-mut">{honorificSuffix(role)}</span>
        </TruncatedText>
        <SignOutButton className="shrink-0" />
      </div>
    </aside>
  );
}
