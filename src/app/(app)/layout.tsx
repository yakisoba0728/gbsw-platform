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
    <div className="workspace-theme min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] print:block">
      <a href="#main-content" className="workspace-skip-link print:hidden">
        본문으로 건너뛰기
      </a>
      <Sidebar name={user.name} role={user.role} />

      <div className="flex min-w-0 flex-col">
        <Topbar name={user.name} role={user.role} />

        <main
          id="main-content"
          tabIndex={-1}
          className="workspace-main min-h-[calc(100dvh-4rem)] flex-1 px-4 pt-4 pb-24 outline-none sm:px-5 md:pt-6 lg:min-h-[calc(100dvh-4.5rem)] lg:px-8 lg:pb-10 xl:px-10 xl:pt-8 print:min-h-0 print:p-0"
        >
          <div className="mx-auto w-full max-w-[92rem]">{children}</div>
        </main>

        <BottomTab role={user.role} />
      </div>
    </div>
  );
}
