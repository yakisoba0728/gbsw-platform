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

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        <NavTree density="sidebar" expand="in-group" role={role} />
      </nav>

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
