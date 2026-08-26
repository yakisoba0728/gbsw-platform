"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { EMPTY_PASS_STATE } from "./action-state";
import { consentAction } from "./actions";

/** 보호자 확인. 교사가 대신 기록하는 길은 승인 화면에 있고 여기는 보호자 전용이다. */
export function ConsentButton({ passId }: { passId: string }) {
  const [state, action, pending] = useActionState(consentAction, EMPTY_PASS_STATE);

  return (
    <form action={action} className="mt-3 w-full space-y-2">
      <input type="hidden" name="passId" value={passId} />
      <Input name="consentNote" size="sm" maxLength={100} placeholder="남길 말 (선택)" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "확인하는 중…" : "보호자 확인"}
      </Button>
      {state.error && <Note tone="error">{state.error}</Note>}
    </form>
  );
}
