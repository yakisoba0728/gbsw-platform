import { redirect } from "next/navigation";
import { BottomTab } from "@/components/app-shell/bottom-tab";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { requireAuth } from "@/core/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAuth();

  // 관리자가 비밀번호를 초기화한 계정은 어떤 화면에도 들어가기 전에 가로챈다.
  if (user.mustChangePassword) redirect("/change-password");

  // 메뉴 설정은 클라이언트 컴포넌트가 직접 import한다 (nav.ts 주석 참고).
  // 여기서 넘기는 건 직렬화 가능한 값뿐이다.
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar role={user.role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar name={user.name} role={user.role} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-7">{children}</main>

        <BottomTab role={user.role} />
      </div>
    </div>
  );
}
