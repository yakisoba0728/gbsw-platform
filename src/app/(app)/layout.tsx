import { BottomTab } from "@/components/app-shell/bottom-tab";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { requireAuth } from "@/core/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAuth();

  // 인쇄에서 내용이 잘리지 않도록 화면 높이 제한과 스크롤 넘침을 푼다.
  return (
    <div className="flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:m-0 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-btn focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:[clip:auto] focus:[clip-path:none] focus:whitespace-normal"
      >
        본문 바로가기
      </a>
      <Sidebar name={user.name} role={user.role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar name={user.name} role={user.role} />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-4 lg:p-7 print:overflow-visible print:p-0"
        >
          {children}
        </main>

        <BottomTab role={user.role} />
      </div>
    </div>
  );
}
