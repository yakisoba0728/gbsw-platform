"use client";

import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CloseIcon, MenuIcon } from "@/components/icons";
import type { Role } from "@/core/authz/roles";
import { NavTree } from "./nav-tree";

export function MobileNav({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const location = `${pathname}?${search}`;
  const [lastLocation, setLastLocation] = useState(location);
  if (lastLocation !== location) {
    setLastLocation(location);
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="quiet"
        size="icon"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="-ml-2 lg:hidden"
      >
        <MenuIcon size={20} />
        <span className="sr-only">메뉴 열기</span>
      </Button>

      <dialog
        id="mobile-nav"
        ref={dialogRef}
        aria-label="메뉴"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-dvh w-68 max-w-[82vw] border-0 bg-surface p-0 text-ink backdrop:bg-black/40"
      >
        <div className="flex h-full w-full flex-col overflow-y-auto px-3 py-5">
          <div className="flex items-center justify-between gap-2 pb-6">
            <span className="flex items-center gap-2.5 px-3">
              <Image src="/brand/gbsw-logo.webp" alt="" width={30} height={30} />
              <span>
                <span className="block text-sm font-semibold tracking-tight text-ink">
                  GBSW
                </span>
                <span className="block text-xs text-mut">통합관리시스템</span>
              </span>
            </span>
            <Button
              variant="quiet"
              size="icon"
              onClick={() => setOpen(false)}
            >
              <CloseIcon size={18} />
              <span className="sr-only">메뉴 닫기</span>
            </Button>
          </div>

          <nav className="flex flex-col gap-0.5">
            <NavTree density="drawer" expand="always" role={role} />
          </nav>
        </div>
      </dialog>
    </>
  );
}
