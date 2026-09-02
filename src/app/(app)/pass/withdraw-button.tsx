"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EMPTY_PASS_STATE } from "./action-state";
import { withdrawAction } from "./actions";

export function WithdrawButton({ passId }: { passId: string }) {
  const [state, action, pending] = useActionState(withdrawAction, EMPTY_PASS_STATE);

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button type="button" variant="ghost" size="sm" onClick={open}>
          신청 취소
        </Button>
      )}
      title="신청 취소"
      description="이 신청을 무릅니다."
      reasonLabel="사유"
      reasonPlaceholder="예: 일정이 바뀜"
      reasonRequired={false}
      confirmLabel="신청 취소"
      pendingLabel="취소 중…"
      action={action}
      pending={pending}
      state={state}
    >
      <input type="hidden" name="passId" value={passId} />
    </ConfirmDialog>
  );
}
