import { BottomTab } from "@/components/app-shell/bottom-tab";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { requireAuth } from "@/core/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // mustChangePassword 가로채기는 requireAuth 안에 있다 (M12). 여기서 다시 보지 않는다.
  const user = await requireAuth();

  /**
   * print:* — 확인서가 이 레이아웃 안에 있다. `h-dvh overflow-hidden`이 남으면
   * 브라우저가 화면 한 장 높이에서 인쇄를 잘라 긴 내역이 첫 장에서 끊긴다.
   */
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
