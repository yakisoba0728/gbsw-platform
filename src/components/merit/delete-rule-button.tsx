"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type DeleteActionState = {
  ok: boolean;
  error: string | null;
};

export function DeleteRuleButton({
  ruleId,
  updatedAt,
  label,
  deleteAction,
  initialState,
}: {
  ruleId: string;
  updatedAt: string;
  label: string;
  deleteAction: (
    prev: DeleteActionState,
    formData: FormData,
  ) => Promise<DeleteActionState>;
  initialState: DeleteActionState;
}) {
  const [state, formAction, pending] = useActionState(deleteAction, initialState);

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button
          type="button"
          variant="danger"
          size="sm"
          aria-label={`${label} 규정 삭제`}
          onClick={open}
        >
          삭제
        </Button>
      )}
      title="규정 삭제"
      description={
        <>
          <span className="font-medium text-ink">{label}</span> 규정을 지웁니다.
          되돌릴 수 없습니다.
        </>
      }
      reasonLabel="삭제 사유"
      reasonPlaceholder="예: 규정 개정으로 없어짐"
      confirmLabel="삭제"
      pendingLabel="삭제 중…"
      action={formAction}
      pending={pending}
      state={state}
    >
      <input type="hidden" name="ruleId" value={ruleId} />
      <input type="hidden" name="updatedAt" value={updatedAt} />
    </ConfirmDialog>
  );
}
