"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EMPTY_PASS_STATE } from "./action-state";
import { cancelAction } from "./actions";

export function CancelButton({ passId }: { passId: string }) {
  const [state, action, pending] = useActionState(cancelAction, EMPTY_PASS_STATE);

  return (
    <div className="mt-2 flex justify-end">
      <ConfirmDialog
        trigger={(open) => (
          <Button type="button" variant="danger" size="sm" onClick={open}>
            취소
          </Button>
        )}
        title="출입증 취소"
        description="승인된 출입증을 무릅니다. 학생의 QR이 곧바로 통하지 않습니다."
        reasonLabel="사유"
        reasonPlaceholder="예: 학사 일정 변경"
        reasonRequired={false}
        confirmLabel="취소"
        pendingLabel="취소 중…"
        action={action}
        pending={pending}
        state={state}
      >
        <input type="hidden" name="passId" value={passId} />
      </ConfirmDialog>
    </div>
  );
}
