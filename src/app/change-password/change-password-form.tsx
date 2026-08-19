"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const INITIAL: ChangePasswordState = { error: null, ok: false };

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    INITIAL,
  );

  return (
    <form action={formAction}>
      <h1 className="mb-2 text-title font-semibold text-ink">비밀번호 변경</h1>
      <p className="mb-8 text-caption text-mut">
        {forced
          ? "계속하려면 새 비밀번호를 정해야 합니다. 변경 후 다시 로그인합니다."
          : "새 비밀번호를 정합니다. 변경 후 다시 로그인합니다."}
      </p>

      <Label htmlFor="currentPassword">현재 비밀번호</Label>
      <Input
        id="currentPassword"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        className="mb-4"
      />

      <Label htmlFor="newPassword">
        새 비밀번호 <span className="font-normal text-mut">(10자 이상)</span>
      </Label>
      <Input
        id="newPassword"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        className="mb-4"
      />

      <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
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
        {pending ? "변경 중…" : "변경"}
      </Button>
    </form>
  );
}
