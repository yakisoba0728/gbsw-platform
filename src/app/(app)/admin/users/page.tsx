import type { Metadata } from "next";
import { requireAuth } from "@/core/auth/session";
import { ChipLink } from "@/components/ui/chip-link";
import { InvitesPanel } from "../invites/panel";
import { StudentsPanel } from "../students/panel";
import { AccountsPanel } from "./panel";
import {
  ADMIN_TABS,
  ADMIN_TAB_LABELS,
  adminTabParam,
  parseAdminTab,
} from "./admin-tab";

/**
 * 탭 제목은 탭을 따라가지 않는다. `generateMetadata`에 searchParams를 물리면
 * 같은 경로에서 쿼리만 바뀌는 이동에서 제목이 처음 값에 붙박인다(통계 화면에서
 * 확인했다). 틀린 제목보다 한 이름이 낫다 — 지금 보는 탭은 켜진 칩이 답한다.
 */
export const metadata: Metadata = { title: "계정 관리" };

/**
 * 계정 관리 — 계정 · 초대 · 학생.
 *
 * 셋을 한 주소에 모으고 `?tab=`으로 고른다. 초대가 계정이 되고 그 계정에 학급·
 * 번호가 붙는 한 흐름이라, 어느 각도로 볼지는 화면 안에서 고르는 편이 맞다.
 *
 * **권한은 여기서 통으로 걸지 않는다.** 탭마다 요구하는 것이 달라(`user:manage`·
 * `invite:list`·`student:manage`) 하나로 묶으면 실제보다 넓거나 좁게 막힌다.
 * 여기서는 로그인만 확인하고, 각 패널이 제 권한으로 다시 검사한다.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth();

  const tab = parseAdminTab((await searchParams).tab);

  return (
    // 세 탭이 같은 자리에 선다 — 폭을 여기서 한 번만 정한다. 탭마다 다르면
    // 탭을 누를 때마다 카드 가장자리가 좌우로 흔들린다.
    <div className="@container mx-auto max-w-7xl space-y-4">
      <nav aria-label="계정 관리 갈래" className="flex flex-wrap gap-1.5">
        {ADMIN_TABS.map((item) => (
          <ChipLink
            key={item}
            size="sm"
            active={item === tab}
            href={
              adminTabParam(item) === null
                ? "/admin/users"
                : `/admin/users?tab=${adminTabParam(item)}`
            }
          >
            {ADMIN_TAB_LABELS[item]}
          </ChipLink>
        ))}
      </nav>

      {tab === "invites" && <InvitesPanel />}
      {tab === "students" && <StudentsPanel />}
      {tab === "accounts" && <AccountsPanel />}
    </div>
  );
}
