"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { authClient } from "@/core/auth/auth-client";

/** 관리자가 계정을 잠갔을 때 보여줄 문구. 배너와 로그인 실패 메시지가 같은 문구를 쓴다. */
const DISABLED_MESSAGE = "비활성화된 계정입니다. 관리자에게 문의해 주세요.";

export function LoginForm({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    disabled ? DISABLED_MESSAGE : null,
  );
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
      // 단, 403(비활성 계정)은 예외다 — 이 응답은 비밀번호가 맞아야만 나오므로
      // (databaseHooks의 세션 생성 차단이 자격 확인 "이후"에 실행된다)
      // 여기서 안내해도 계정 존재 여부가 새지 않는다.
      setError(
        result.error.status === 429
          ? "시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요."
          : result.error.status === 403
            ? DISABLED_MESSAGE
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
        <Note tone="error" className="mb-4">
          {error}
        </Note>
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
