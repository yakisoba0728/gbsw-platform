"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import {
  LOGIN_DISABLED_MESSAGE,
  type LoginErrorCode,
  loginErrorMessage,
} from "./login-state";

const PASSWORD_CHANGED_MESSAGE = "비밀번호가 변경되었습니다. 다시 로그인해 주세요.";

export function LoginForm({
  disabled = false,
  passwordChanged = false,
  next = null,
  initialEmail = "",
  initialError = null,
}: {
  disabled?: boolean;
  passwordChanged?: boolean;
  next?: string | null;
  initialEmail?: string;
  initialError?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    disabled ? LOGIN_DISABLED_MESSAGE : initialError,
  );
  const notice = !disabled && passwordChanged ? PASSWORD_CHANGED_MESSAGE : null;
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
      });
      const result = (await response.json()) as {
        error?: LoginErrorCode;
        redirectTo?: string;
      };

      if (!response.ok || !result.redirectTo) {
        const password = form.elements.namedItem("password");
        if (password instanceof HTMLInputElement) password.value = "";
        setError(
          loginErrorMessage(result.error) ??
            "로그인 중 오류가 발생했습니다. 다시 시도해 주세요.",
        );
        setPending(false);
        return;
      }

      router.replace(result.redirectTo);
      router.refresh();
    } catch {
      const password = form.elements.namedItem("password");
      if (password instanceof HTMLInputElement) password.value = "";
      setPending(false);
      setError("로그인 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <form
      action="/login/submit"
      method="post"
      onSubmit={handleSubmit}
      className="animate-auth-in"
    >
      {next && <input type="hidden" name="next" value={next} />}
      <h1 className="mb-8 text-title font-semibold text-ink">로그인</h1>

      <Label htmlFor="email">이메일</Label>
      <Input
        size="lg"
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="name@gbsw.hs.kr"
        required
        defaultValue={initialEmail}
        className="mb-4"
      />

      <Label htmlFor="password">비밀번호</Label>
      <Input
        size="lg"
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="비밀번호"
        required
        className="mb-6"
      />

      {error && (
        <Note tone="error" className="mb-4">
          {error}
        </Note>
      )}
      {notice && (
        <Note tone="success" className="mb-4">
          {notice}
        </Note>
      )}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? "로그인 중…" : "로그인"}
      </Button>

      <p className="mt-6 text-center text-caption text-mut">
        가입코드가 있으신가요?{" "}
        <Link
          href="/register"
          className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          가입
        </Link>
      </p>
    </form>
  );
}
