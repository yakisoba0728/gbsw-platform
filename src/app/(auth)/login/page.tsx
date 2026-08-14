import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/core/auth/session";
import { AuthPanel } from "../auth-panel";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // status까지 확인해야 한다. 세션이 "있다"는 이유만으로 보내면 비활성 계정이
  // /login ↔ / 사이를 무한 반복한다 — (app) 레이아웃의 requireAuth가 status를 보고
  // 다시 이리로 돌려보내기 때문이다.
  const user = await getSessionUser();
  if (user?.status === "ACTIVE") redirect("/");

  const { disabled } = await searchParams;

  return (
    <AuthPanel>
      <LoginForm disabled={disabled === "1"} />
    </AuthPanel>
  );
}
