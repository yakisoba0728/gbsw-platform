"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMPTY_MERIT_STATE } from "../action-state";
import { cancelBatchAction } from "../actions";

/**
 * 일괄 취소.
 *
 * 사유가 필수라 확인 창(confirm)만으로는 부족하다 — 단건 취소와 같은 이유다.
 * 입력칸을 표 안에 펼치지 않고 모달로 띄운다: 이 버튼은 폭 100px짜리 칸에
 * 들어 있어서, 그 자리에서 펼치면 사유 입력칸이 한 글자 폭으로 찌그러진다.
 */
export function CancelBatchButton({
  batchId,
  count,
}: {
  batchId: string;
  count: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(
    cancelBatchAction,
    EMPTY_MERIT_STATE,
  );

  // 성공하면 닫는다. 실패하면 사유를 남겨 두어 고쳐서 다시 누를 수 있게 한다.
  // ref는 렌더 중에 못 만지므로 effect에서 닫는다. 사유 비우기는 여기서 하지
  // 않고 열 때 한다 — effect 안에서 setState하면 리렌더가 한 번 더 돈다.
  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state]);

  function open() {
    setReason("");
    dialogRef.current?.showModal();
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={open}
      >
        묶음 {count}건
      </Button>

      <dialog
        ref={dialogRef}
        // 기본 스타일(가운데 정렬·backdrop)은 브라우저가 준다. 배경 클릭으로
        // 닫히지는 않게 둔다 — 사유를 쓰다가 잘못 눌러 날아가면 다시 써야 한다.
        className="rounded-card border border-line bg-surface p-0 backdrop:bg-black/40"
      >
        <form action={formAction} className="w-[420px] max-w-full p-5">
          <input type="hidden" name="batchId" value={batchId} />

          <h2 className="text-base font-extrabold text-ink">일괄 취소</h2>
          <p className="mt-1 text-[13px] text-mut">
            한 번에 부여한 <b className="text-rose">{count}건</b>을 통째로
            취소합니다. 기록은 사라지지 않고 취소 표시가 붙습니다.
          </p>

          <label
            htmlFor="batch-cancel-reason"
            className="mt-4 block text-[12px] font-semibold text-mut"
          >
            취소 사유 (필수)
          </label>
          <Input
            id="batch-cancel-reason"
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 항목을 잘못 골라 부여함"
            required
            maxLength={500}
            autoFocus
            className="mt-1 w-full"
          />

          {state.error && (
            <p
              role="alert"
              className="mt-2 rounded-btn bg-rose-soft px-3 py-2 text-[13px] font-semibold text-rose"
            >
              {state.error}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => dialogRef.current?.close()}
            >
              닫기
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={pending || reason.trim() === ""}
            >
              {pending ? "취소 중…" : `${count}건 취소`}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
