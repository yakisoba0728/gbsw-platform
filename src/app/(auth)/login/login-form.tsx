"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { authClient } from "@/core/auth/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
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
      // 계정 존재 여부가 드러나지 않도록 원인을 구분해 알리지 않는다.
      setError(
        result.error.status === 429
          ? "시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요."
          : "이메일 또는 비밀번호가 올바르지 않습니다.",
      );
      return;
    }

    // 세션 쿠키가 붙은 상태로 서버 컴포넌트를 다시 그리게 한다.
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="animate-auth-in">
      <h1 className="mb-1.5 text-2xl font-extrabold tracking-[-0.02em] text-ink">
        로그인
      </h1>
      <p className="mb-[26px] text-[13.5px] text-mut">
        학교 계정으로 로그인하세요.
      </p>

      <Label htmlFor="email">이메일</Label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="name@gbsw.hs.kr"
        required
        className="mb-[15px]"
      />

      <Label htmlFor="password">비밀번호</Label>
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="비밀번호"
        required
        className="mb-[22px]"
      />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose"
        >
          {error}
        </p>
      )}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? "로그인 중…" : "로그인"}
      </Button>

      <p className="mt-5 text-center text-[13px] text-mut">
        가입코드를 받으셨나요?{" "}
        <Link href="/register" className="font-bold text-pri hover:underline">
          가입하기
        </Link>
      </p>
    </form>
  );
}
