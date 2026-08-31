import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/core/auth/session";
import { safeNext } from "@/lib/safe-next";
import { AuthPanel } from "../auth-panel";
import { LoginForm } from "./login-form";
import {
  LOGIN_EMAIL_HINT_COOKIE,
  loginErrorMessage,
} from "./login-state";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // searchParams를 먼저 읽는다 — 아래 리다이렉트가 목적지를 알아야 한다.
  const { disabled, loginError, passwordChanged, next } = await searchParams;
  const destination = safeNext(next);

  // status까지 본다. 세션만 보고 보내면 중지된 계정이 /login ↔ / 를 무한 반복한다.
  const user = await getSessionUser();
  if (user?.status === "ACTIVE") redirect(destination ?? "/");

  const fallbackError = loginErrorMessage(loginError);
  const cookieStore = await cookies();
  const fallbackEmail = fallbackError
    ? (cookieStore.get(LOGIN_EMAIL_HINT_COOKIE)?.value ?? "")
    : "";

  return (
    <AuthPanel>
      <LoginForm
        disabled={disabled === "1"}
        passwordChanged={passwordChanged === "1"}
        next={destination}
        initialEmail={fallbackEmail}
        initialError={fallbackError}
      />
    </AuthPanel>
  );
}
