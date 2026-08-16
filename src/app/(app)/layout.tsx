import { BottomTab } from "@/components/app-shell/bottom-tab";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { requireAuth } from "@/core/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 관리자가 비밀번호를 초기화한 계정은 어떤 화면에도 들어가기 전에 requireAuth가
  // 가로채 /change-password로 보낸다 (M12) — 서버 액션에서도 같은 게이트가
  // 걸리도록 requireAuth 안으로 옮겼다. 여기서 다시 검사하지 않는다.
  const user = await requireAuth();

  // 메뉴 설정은 클라이언트 컴포넌트가 직접 import한다 (nav.ts 주석 참고).
  // 여기서 넘기는 건 직렬화 가능한 값뿐이다.
  /*
   * print:* — 확인서(/merit/students/[id]/print)가 이 레이아웃 **안**에 있다.
   * 앱 셸 세 조각(사이드바·상단바·하단탭)은 각자 print:hidden으로 빠지지만,
   * 그것만으로는 부족하다: 여기 `h-dvh overflow-hidden`과 main의 `overflow-y-auto`가
   * 남아 있으면 브라우저가 화면 한 장 높이에서 인쇄를 잘라, 내역이 긴 학생의
   * 확인서가 첫 장에서 끊긴다. 높이·넘침 제어를 인쇄에서만 풀어 준다.
   */
  return (
    <div className="flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
      <Sidebar role={user.role} />

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
