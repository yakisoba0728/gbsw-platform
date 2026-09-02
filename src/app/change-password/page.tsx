import type { Metadata } from "next";
import { requireAuth } from "@/core/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "비밀번호 변경" };

export default async function ChangePasswordPage() {
  const user = await requireAuth({ allowMustChangePassword: true });

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-[360px]">
        <ChangePasswordForm forced={user.mustChangePassword} />
      </div>
    </main>
  );
}
