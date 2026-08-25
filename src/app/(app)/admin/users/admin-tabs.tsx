"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  ADMIN_TABS,
  ADMIN_TAB_LABELS,
  adminTabParam,
  type AdminTab,
} from "./admin-tab";
import { hasUnsavedEdits } from "./unsaved";

/**
 * 계정 관리의 탭 줄.
 *
 * `ChipLink`를 쓰지 않고 `Link`를 직접 세우는 이유는 `onNavigate`가 필요해서다 —
 * 학생 탭에 저장하지 않은 수정이 있으면 떠나기 전에 한 번 묻는다. 모양은
 * `ChipLink`의 sm 규격을 그대로 베낀다.
 *
 * 브라우저 기본 확인창을 쓴다. 이 저장소의 `ConfirmDialog`는 사유 입력이 필수인
 * 되돌릴 수 없는 동작용이라 여기에 맞지 않고, "저장 안 한 게 있는데 나갈래?"는
 * 브라우저 확인창이 가장 잘 알려진 모양이다.
 */
export function AdminTabs({ current }: { current: AdminTab }) {
  return (
    <nav aria-label="계정 관리 갈래" className="flex flex-wrap gap-1.5">
      {ADMIN_TABS.map((item) => {
        const param = adminTabParam(item);
        const active = item === current;

        return (
          <Link
            key={item}
            href={param === null ? "/admin/users" : `/admin/users?tab=${param}`}
            aria-current={active ? "page" : undefined}
            onNavigate={(event) => {
              if (active || !hasUnsavedEdits()) return;
              if (
                !window.confirm(
                  "저장하지 않은 수정이 있습니다. 탭을 옮기면 고친 내용이 사라집니다.",
                )
              ) {
                event.preventDefault();
              }
            }}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors lg:py-1.5",
              active
                ? "border-ink bg-ink text-white"
                : "border-line bg-surface text-mut hover:bg-soft hover:text-ink",
            )}
          >
            {ADMIN_TAB_LABELS[item]}
          </Link>
        );
      })}
    </nav>
  );
}
