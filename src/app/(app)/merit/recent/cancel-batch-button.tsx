"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EMPTY_MERIT_STATE } from "../action-state";
import { cancelBatchAction } from "../actions";

/**
 * 일괄 취소.
 *
 * 사유가 필수라 확인 창(confirm)만으로는 부족하다 — 단건 취소와 같은 이유다.
 * 입력칸을 표 안에 펼치지 않고 모달로 띄운다: 이 버튼은 폭 100px짜리 칸에
 * 들어 있어서, 그 자리에서 펼치면 사유 입력칸이 한 글자 폭으로 찌그러진다.
 *
 * 모달 자체는 `ui/ConfirmDialog`가 맡는다 — 사유 입력칸의 id가 `useId()`로
 * 만들어지는 것이 여기서 특히 중요하다. 이 버튼은 **묶음마다 하나씩** 달리고
 * `<dialog>`는 조건부가 아니라 늘 렌더되므로, 고정 id를 쓰면 같은 id가 화면에
 * N개 생겨 두 번째 이후 모달의 입력칸이 접근 가능한 이름을 잃는다.
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
          한 번에 부여한 <b className="text-rose">{count}건</b>을 통째로 취소합니다.
          기록은 사라지지 않고 취소 표시가 붙습니다.
        </>
      }
      reasonLabel="취소 사유 (필수)"
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
