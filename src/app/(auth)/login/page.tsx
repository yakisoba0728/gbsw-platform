import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/core/auth/session";
import { AuthPanel } from "../auth-panel";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");

  return (
    <AuthPanel>
      <LoginForm />
    </AuthPanel>
  );
}
