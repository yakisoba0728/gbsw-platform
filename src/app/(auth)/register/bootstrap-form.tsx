"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Note } from "@/components/ui/note";
import { formatPhone } from "@/lib/masks";
import { createInitialAdminAction, type BootstrapState } from "./actions";

const INITIAL: BootstrapState = {
  error: null,
  values: { name: "", email: "", phone: "" },
};

export function BootstrapForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    createInitialAdminAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="animate-auth-in">
      <input type="hidden" name="token" value={token} />

      <h1 className="mb-2 text-title font-semibold text-ink">
        첫 관리자 계정
      </h1>
      <p className="mb-8 text-caption text-mut">이 화면은 한 번만 열립니다.</p>

      {/*
        비제어 칸이라 실패 뒤 폼 자동 리셋(React 19)에 지워진다. 액션이 되돌려준
        제출값을 defaultValue로 다시 심어 살린다 — 리셋은 이 커밋의 DOM 갱신이
        끝난 뒤에 돌아서 새 defaultValue를 본다. 비밀번호 두 칸은 일부러 뺐다.
      */}
      <Label htmlFor="name">이름</Label>
      <Input
        id="name"
        name="name"
        autoComplete="name"
        maxLength={50}
        required
        defaultValue={state.values.name}
        className="mb-4"
      />

      <Label htmlFor="email">이메일</Label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="name@gbsw.hs.kr"
        required
        defaultValue={state.values.email}
        className="mb-4"
      />

      <Label htmlFor="phone">전화번호</Label>
      <MaskedInput
        id="phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        placeholder="010-0000-0000"
        format={formatPhone}
        required
        defaultValue={state.values.phone}
        className="mb-4"
      />

      <Label htmlFor="password">
        비밀번호 <span className="font-normal text-mut">(10자 이상)</span>
      </Label>
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        className="mb-4"
      />

      <Label htmlFor="confirmPassword">비밀번호 확인</Label>
      <Input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        className="mb-6"
      />

      {state.error && (
        <Note tone="error" className="mb-4">
          {state.error}
        </Note>
      )}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? "만드는 중…" : "만들기"}
      </Button>
    </form>
  );
}
