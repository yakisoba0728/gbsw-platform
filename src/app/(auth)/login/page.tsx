import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/core/auth/session";
import { safeNext } from "@/lib/safe-next";
import { AuthPanel } from "../auth-panel";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // searchParams를 먼저 읽는다 — 아래 리다이렉트가 목적지를 알아야 한다.
  const { disabled, passwordChanged, next } = await searchParams;
  const destination = safeNext(next);

  // status까지 본다. 세션만 보고 보내면 중지된 계정이 /login ↔ / 를 무한 반복한다.
  const user = await getSessionUser();
  if (user?.status === "ACTIVE") redirect(destination ?? "/");

  return (
    <AuthPanel>
      <LoginForm
        disabled={disabled === "1"}
        passwordChanged={passwordChanged === "1"}
        next={destination}
      />
    </AuthPanel>
  );
}
