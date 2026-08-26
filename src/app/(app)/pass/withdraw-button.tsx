"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { EMPTY_PASS_STATE } from "./action-state";
import { withdrawAction } from "./actions";

/** 신청 철회. 승인된 것을 무르는 일은 교사가 하므로 여기 없다. */
export function WithdrawButton({ passId }: { passId: string }) {
  const [state, action, pending] = useActionState(withdrawAction, EMPTY_PASS_STATE);

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="passId" value={passId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "취소 중…" : "신청 취소"}
      </Button>
      {state.error && (
        <Note tone="error" className="mt-2">
          {state.error}
        </Note>
      )}
    </form>
  );
}
