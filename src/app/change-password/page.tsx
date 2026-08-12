import type { Metadata } from "next";
// requireRole이 아니라 requireAuth를 쓴다 — mustChangePassword로 여기 온 사용자를
// 다시 튕겨내면 무한 리다이렉트가 된다.
import { requireAuth } from "@/core/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "비밀번호 변경" };

export default async function ChangePasswordPage() {
  const user = await requireAuth();

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-[380px] rounded-card border border-line bg-surface p-8">
        <ChangePasswordForm forced={user.mustChangePassword} />
      </div>
    </main>
  );
}
