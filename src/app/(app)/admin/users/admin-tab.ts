export const ADMIN_TABS = ["accounts", "invites", "students"] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

export const ADMIN_TAB_LABELS: Record<AdminTab, string> = {
  accounts: "계정",
  invites: "초대",
  students: "학생",
};

export function parseAdminTab(value: unknown): AdminTab {
  return typeof value === "string" && (ADMIN_TABS as readonly string[]).includes(value)
    ? (value as AdminTab)
    : "accounts";
}
