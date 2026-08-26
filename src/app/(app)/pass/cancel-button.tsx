"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { EMPTY_PASS_STATE } from "./action-state";
import { cancelAction } from "./actions";

/** 교사가 승인된 출입증을 무른다. 사유는 선택이지만 남으면 감사로그에 실린다. */
export function CancelButton({ passId }: { passId: string }) {
  const [state, action, pending] = useActionState(cancelAction, EMPTY_PASS_STATE);

  return (
    <form action={action} className="mt-2 flex items-center justify-end gap-2">
      <input type="hidden" name="passId" value={passId} />
      <Input
        name="reason"
        size="sm"
        maxLength={200}
        placeholder="사유 (선택)"
        className="w-36"
      />
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {pending ? "취소 중…" : "취소"}
      </Button>
      {state.error && <Note tone="error">{state.error}</Note>}
    </form>
  );
}
