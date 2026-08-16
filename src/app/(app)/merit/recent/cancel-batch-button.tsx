"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMPTY_MERIT_STATE } from "../action-state";
import { cancelBatchAction } from "../actions";

/**
 * 일괄 취소. 사유가 필수라 확인 창(confirm)만으로는 부족하다 —
 * 단건 취소 버튼과 같은 이유이고 같은 절차를 쓴다.
 */
export function CancelBatchButton({
  batchId,
  count,
}: {
  batchId: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(
    cancelBatchAction,
    EMPTY_MERIT_STATE,
  );

  // 성공하면 입력창을 닫는다. 실패하면 사유를 남겨 두어 다시 누를 수 있게 한다.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) {
      setOpen(false);
      setReason("");
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        묶음 취소
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-wrap items-center gap-2 pt-2">
      <input type="hidden" name="batchId" value={batchId} />
      <span className="text-[12.5px] font-semibold text-rose">
        {count}건을 한 번에 취소합니다.
      </span>
      <Input
        dense
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="취소 사유 (필수)"
        aria-label="일괄 취소 사유"
        required
        maxLength={500}
        className="min-w-[200px] flex-1"
      />
      <Button type="submit" variant="danger" size="sm" disabled={pending || reason.trim() === ""}>
        {pending ? "취소 중…" : "취소하기"}
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
        닫기
      </Button>
      {state.error && (
        <p role="alert" className="w-full text-[12.5px] font-semibold text-rose">
          {state.error}
        </p>
      )}
    </form>
  );
}
