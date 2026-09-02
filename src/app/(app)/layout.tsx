import { BottomTab } from "@/components/app-shell/bottom-tab";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { requireAuth } from "@/core/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAuth();

  return (
    <div className="flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
      <Sidebar name={user.name} role={user.role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar name={user.name} role={user.role} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-7 print:overflow-visible print:p-0">
          {children}
        </main>

        <BottomTab role={user.role} />
      </div>
    </div>
  );
}
