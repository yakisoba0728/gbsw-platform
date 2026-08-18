"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EMPTY_MERIT_STATE } from "../action-state";
import { cancelBatchAction } from "../actions";

/**
 * 일괄 취소. 사유가 필수라 confirm()만으로는 부족하고, 좁은 칸이라 모달로 띄운다.
 * 이 버튼은 묶음마다 하나씩 달리므로 입력칸 id가 useId()여야 한다.
 */
export function CancelBatchButton({
  batchId,
  count,
}: {
  batchId: string;
  count: number;
}) {
  const [state, formAction, pending] = useActionState(
    cancelBatchAction,
    EMPTY_MERIT_STATE,
  );

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button type="button" variant="secondary" size="sm" onClick={open}>
          묶음 {count}건
        </Button>
      )}
      title="일괄 취소"
      description={
        <>
          한 번에 부여한 <b className="font-medium text-rose">{count}건</b>을 통째로
          취소합니다. 되돌릴 수 없습니다.
        </>
      }
      reasonLabel="취소 사유"
      reasonPlaceholder="예: 항목을 잘못 골라 부여함"
      confirmLabel={`${count}건 취소`}
      pendingLabel="취소 중…"
      action={formAction}
      pending={pending}
      state={state}
    >
      <input type="hidden" name="batchId" value={batchId} />
    </ConfirmDialog>
  );
}
