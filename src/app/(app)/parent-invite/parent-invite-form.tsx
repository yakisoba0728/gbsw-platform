"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SecretPanel } from "@/components/ui/secret-panel";
import { PARENT_INVITE_INITIAL } from "./action-state";
import { createParentInviteAction } from "./actions";

export function ParentInviteForm() {
  const [state, formAction, pending] = useActionState(
    createParentInviteAction,
    PARENT_INVITE_INITIAL,
  );

  return (
    <form action={formAction}>
      <Label htmlFor="name">학부모 이름</Label>
      <Input id="name" name="name" required maxLength={50} className="mb-6" />

      {state.error && (
        <Note tone="error" className="mb-4">
          {state.error}
        </Note>
      )}

      <ConfirmSubmit
        label="만들기"
        title="학부모 초대코드 만들기"
        description="이 코드로 가입한 사람이 내 상벌점·출입증을 봅니다."
        confirmLabel="만들기"
        pendingLabel="만드는 중…"
        pending={pending}
        size="md"
      />

      {state.code && (
        <SecretPanel
          label="가입코드"
          value={state.code}
          note="학부모에게 그대로 불러 주세요."
          className="mt-4"
        />
      )}
    </form>
  );
}
