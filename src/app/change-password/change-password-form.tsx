"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const INITIAL: ChangePasswordState = { error: null, ok: false };

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    INITIAL,
  );

  useEffect(() => {
    if (state.ok) {
      router.replace("/");
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form action={formAction}>
      <h1 className="mb-1.5 text-2xl font-extrabold tracking-[-0.02em] text-ink">
        비밀번호 변경
      </h1>
      <p className="mb-[26px] text-[13.5px] text-mut">
        {forced
          ? "처음 로그인했거나 비밀번호가 초기화되었습니다. 새 비밀번호를 설정해 주세요."
          : "새 비밀번호를 설정합니다."}
      </p>

      <Label htmlFor="currentPassword">현재 비밀번호</Label>
      <Input
        id="currentPassword"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        className="mb-[15px]"
      />

      <Label htmlFor="newPassword">새 비밀번호</Label>
      <Input
        id="newPassword"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        className="mb-1.5"
      />
      <p className="mb-[15px] text-[11.5px] text-mut">10자 이상</p>

      <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
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
        {pending ? "변경 중…" : "비밀번호 변경"}
      </Button>
    </form>
  );
}
