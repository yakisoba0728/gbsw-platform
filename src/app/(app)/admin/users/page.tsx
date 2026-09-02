import type { Metadata } from "next";
import { requireAuth } from "@/core/auth/session";
import { InvitesPanel } from "../invites/panel";
import { StudentsPanel } from "../students/panel";
import { parseAdminTab } from "./admin-tab";
import { AdminTabs } from "./admin-tabs";
import { AccountsPanel } from "./panel";

export const metadata: Metadata = { title: "계정 관리" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth();

  const tab = parseAdminTab((await searchParams).tab);

  return (
    <div className="@container mx-auto max-w-7xl space-y-4">
      <AdminTabs current={tab} />

      {tab === "invites" && <InvitesPanel />}
      {tab === "students" && <StudentsPanel />}
      {tab === "accounts" && <AccountsPanel />}
    </div>
  );
}
