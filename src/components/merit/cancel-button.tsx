"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type CancelActionState = {
  ok: boolean;
  error: string | null;
  count: number | null;
};

export function CancelButton({
  awardId,
  studentProfileId,
  cancelAction,
  initialState,
}: {
  awardId: string;
  studentProfileId: string;
  cancelAction: (
    prev: CancelActionState,
    formData: FormData,
  ) => Promise<CancelActionState>;
  initialState: CancelActionState;
}) {
  const [state, formAction, pending] = useActionState(cancelAction, initialState);

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button type="button" variant="danger" size="sm" onClick={open}>
          취소
        </Button>
      )}
      title="상벌점 취소"
      description="되돌릴 수 없습니다."
      reasonLabel="취소 사유"
      reasonPlaceholder="예: 항목을 잘못 골라 부여함"
      confirmLabel="취소 처리"
      pendingLabel="취소 중…"
      action={formAction}
      pending={pending}
      state={state}
    >
      <input type="hidden" name="awardId" value={awardId} />
      <input type="hidden" name="studentProfileId" value={studentProfileId} />
    </ConfirmDialog>
  );
}
