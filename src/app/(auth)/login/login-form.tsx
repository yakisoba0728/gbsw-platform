"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { authClient } from "@/core/auth/auth-client";

/** 배너와 로그인 실패가 같은 문구를 쓴다. */
const DISABLED_MESSAGE = "사용이 중지된 계정입니다. 선생님께 문의해 주세요.";
const PASSWORD_CHANGED_MESSAGE = "비밀번호가 변경되었습니다. 다시 로그인해 주세요.";

export function LoginForm({
  disabled = false,
  passwordChanged = false,
  next = null,
}: {
  disabled?: boolean;
  passwordChanged?: boolean;
  /** 로그인 뒤 돌아갈 경로. 이미 safeNext를 통과한 값이다. */
  next?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    disabled ? DISABLED_MESSAGE : null,
  );
  const notice = !disabled && passwordChanged ? PASSWORD_CHANGED_MESSAGE : null;
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const data = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    });

    if (result.error) {
      setPending(false);
      // 계정 존재 여부가 드러나지 않게 원인을 구분하지 않는다. 403은 예외다 —
      // 비밀번호가 맞아야만 나오는 응답이라 존재 여부가 새지 않는다.
      setError(
        result.error.status === 429
          ? "시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요."
          : result.error.status === 403
            ? DISABLED_MESSAGE
            : "이메일 또는 비밀번호가 맞지 않습니다.",
      );
      return;
    }

    // 세션 쿠키가 붙은 상태로 서버 컴포넌트를 다시 그리게 한다.
    // next는 정문에서 QR을 찍고 로그인한 사람을 판정 화면으로 되돌린다 —
    // 없으면 대시보드로 떨어져 다시 스캔해야 한다.
    router.replace(next ?? "/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="animate-auth-in">
      <h1 className="mb-8 text-title font-semibold text-ink">로그인</h1>

      <Label htmlFor="email">이메일</Label>
      <Input size="lg"
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="name@gbsw.hs.kr"
        required
        className="mb-4"
      />

      <Label htmlFor="password">비밀번호</Label>
      <Input size="lg"
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
