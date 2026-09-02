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
  const { disabled, loginError, passwordChanged, next } = await searchParams;
  const destination = safeNext(next);

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
