"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { TruncatedText } from "@/components/ui/truncated-text";
import type { Role } from "@/core/authz/roles";
import { honorificName, honorificSuffix } from "@/core/authz/roles";
import { formatClock } from "@/lib/datetime";
import { MobileNav } from "./mobile-nav";
import { SignOutButton } from "./sign-out-button";
import { titleForPath } from "./nav";

const CLOCK_PLACEHOLDER = "오후 00:00:00";

let clockTick: number | null = null;

function subscribeToClock(onStoreChange: () => void): () => void {
  const read = () => {
    const next = Math.floor(Date.now() / 1000);
    if (next === clockTick) return;
    clockTick = next;
    onStoreChange();
  };

  read();
  const id = setInterval(read, 250);
  return () => clearInterval(id);
}

function getClockTick(): number | null {
  return clockTick;
}

function getServerClockTick(): number | null {
  return null;
}

function Clock() {
  const tick = useSyncExternalStore(
    subscribeToClock,
    getClockTick,
    getServerClockTick,
  );
  const now = tick === null ? null : new Date(tick * 1000);

  return (
    <time
      dateTime={now?.toISOString()}
      className="hidden shrink-0 text-caption tabular-nums text-mut lg:block"
    >
      {now ? (
        <>
          <span className="sr-only">현재 시각 </span>
          {formatClock(now)}
        </>
      ) : (
        <span className="invisible">{CLOCK_PLACEHOLDER}</span>
      )}
    </time>
  );
}

export function Topbar({ name, role }: { name: string; role: Role | null }) {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  return (
    <header className="flex h-14 flex-none items-center justify-between gap-3 border-b border-line bg-surface px-4 lg:h-15 lg:px-7 print:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <MobileNav role={role} />
        <h1 className="min-w-0 text-base font-semibold tracking-tight text-ink lg:text-lg">
          <TruncatedText full={title} screenReaderText="children">
            {title}
          </TruncatedText>
        </h1>
      </div>

      <div className="flex min-w-0 items-center">
        <Clock />

        <TruncatedText
          full={honorificName(name, role)}
          className="text-caption lg:hidden"
        >
          <span className="font-medium text-ink">{name}</span>
          <span className="text-mut">{honorificSuffix(role)}</span>
        </TruncatedText>

        <span className="mx-2 h-4 w-px shrink-0 bg-line lg:hidden" aria-hidden />

        <SignOutButton className="shrink-0 lg:hidden" />
      </div>
    </header>
  );
}
