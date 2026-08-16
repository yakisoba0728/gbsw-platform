"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { EMPTY_MERIT_STATE } from "@/app/(app)/merit/action-state";
import { cancelAction } from "@/app/(app)/merit/actions";

/**
 * 취소 사유 입력을 포함한 확인 절차. confirm()만으로는 부족하다 — 사유가 필수이므로
 * 버튼을 누르면 사유 입력칸이 열리고, 비어 있으면 제출 버튼이 비활성이다.
 */
export function CancelButton({
  awardId,
  studentProfileId,
}: {
  awardId: string;
  studentProfileId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(cancelAction, EMPTY_MERIT_STATE);

  // 취소가 성공하면 모달을 닫는다. 렌더 중 이전 상태와 비교해 처리한다 —
  // useEffect 안에서 곧바로 setState하면 리렌더가 한 번 더 발생한다
  // (react-hooks/set-state-in-effect, rule-table.tsx와 같은 패턴).
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12.5px] font-semibold text-rose hover:underline"
      >
        취소
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-card border border-rose-line bg-surface p-5 shadow-lg">
        <h3 className="text-sm font-extrabold text-rose">상벌점 취소</h3>
        <p className="mt-1.5 text-[12.5px] text-mut">
          이 상벌점 내역을 취소합니다. 학생 순점수에 즉시 반영 해제됩니다.
        </p>

        <form action={formAction} className="mt-4">
          <input type="hidden" name="awardId" value={awardId} />
          <input type="hidden" name="studentProfileId" value={studentProfileId} />

          <label
            htmlFor="cancel-reason"
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            취소 사유
          </label>
          <textarea
            id="cancel-reason"
            name="reason"
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            placeholder="취소 사유를 입력해 주세요"
            className="w-full rounded-field border border-line bg-surface p-[13px] text-sm text-ink outline-none"
          />

          {state.error && (
            <p role="alert" className="mt-2 text-[12.5px] font-semibold text-rose">
              {state.error}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setOpen(false);
                setReason("");
              }}
            >
              닫기
            </Button>
            <Button
              type="submit"
              variant="reject"
              size="sm"
              disabled={pending || reason.trim().length === 0}
            >
              {pending ? "취소하는 중…" : "취소하기"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
