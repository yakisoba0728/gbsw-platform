"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  createParentInviteAction,
  type ParentInviteState,
} from "./actions";

const INITIAL: ParentInviteState = { error: null, code: null };

export function ParentInviteForm() {
  const [state, formAction, pending] = useActionState(
    createParentInviteAction,
    INITIAL,
  );

  return (
    <form action={formAction}>
      <Label htmlFor="name">학부모님 이름</Label>
      <Input id="name" name="name" required maxLength={50} className="mb-[22px]" />

      {state.error && (
        <p
          role="alert"
          className="mb-4 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" full disabled={pending}>
        {pending ? "만드는 중…" : "가입코드 만들기"}
      </Button>

      {state.code && (
        <div className="mt-4 rounded-btn bg-pri-soft px-4 py-3">
          <p className="text-[12px] font-semibold text-pri">발급된 가입코드</p>
          <p className="mt-1 text-xl font-extrabold text-ink">
            {state.code}
          </p>
        </div>
      )}
    </form>
  );
}
