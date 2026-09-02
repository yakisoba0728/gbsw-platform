"use client";

import { Segmented, SegmentLink } from "@/components/ui/segmented";
import {
  ADMIN_TABS,
  ADMIN_TAB_LABELS,
  type AdminTab,
} from "./admin-tab";
import { hasUnsavedEdits } from "./unsaved";

export function AdminTabs({ current }: { current: AdminTab }) {
  return (
    <Segmented role="navigation" aria-label="계정 관리 갈래">
      {ADMIN_TABS.map((item) => {
        const active = item === current;

        return (
          <SegmentLink
            key={item}
            active={active}
            href={item === "accounts" ? "/admin/users" : `/admin/users?tab=${item}`}
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
          >
            {ADMIN_TAB_LABELS[item]}
          </SegmentLink>
        );
      })}
    </Segmented>
  );
}
