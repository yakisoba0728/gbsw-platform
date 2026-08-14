import type { Metadata } from "next";
// requirePermission 같은 권한 게이트가 아니라 requireAuth만 쓴다 — mustChangePassword로
// 여기 온 사용자를 다시 튕겨내면 무한 리다이렉트가 된다. requireAuth 자신이
// mustChangePassword를 가로채므로(M12) allowMustChangePassword로 이 페이지만 예외를 둔다.
import { requireAuth } from "@/core/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "비밀번호 변경" };

export default async function ChangePasswordPage() {
  const user = await requireAuth({ allowMustChangePassword: true });

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-[380px] rounded-card border border-line bg-surface p-8">
        <ChangePasswordForm forced={user.mustChangePassword} />
      </div>
    </main>
  );
}
