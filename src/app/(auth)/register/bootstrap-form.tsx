"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createInitialAdminAction, type BootstrapState } from "./actions";

const INITIAL: BootstrapState = { error: null };

export function BootstrapForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    createInitialAdminAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="animate-auth-in">
      <input type="hidden" name="token" value={token} />

      <h1 className="mb-1.5 text-2xl font-extrabold tracking-[-0.02em] text-ink">
        관리자 계정 만들기
      </h1>
      <p className="mb-[26px] text-[13.5px] text-mut">
        이 화면은 한 번만 열립니다.
      </p>

      <Label htmlFor="name">이름</Label>
      <Input
        id="name"
        name="name"
        autoComplete="name"
        maxLength={50}
        required
        className="mb-[15px]"
      />

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

      <Label htmlFor="password">비밀번호 (10자 이상)</Label>
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        className="mb-[15px]"
      />

      <Label htmlFor="confirmPassword">비밀번호 확인</Label>
      <Input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        className="mb-[22px]"
      />

      {state.error && (
        <p
          role="alert"
          className="mb-4 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? "생성 중…" : "계정 만들기"}
      </Button>
    </form>
  );
}
