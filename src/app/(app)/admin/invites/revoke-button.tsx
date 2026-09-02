"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { REVOKE_INITIAL } from "./action-state";
import { revokeInviteAction } from "./actions";

export function RevokeButton({
  inviteId,
  ariaLabel,
}: {
  inviteId: string;
  ariaLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(
    revokeInviteAction,
    REVOKE_INITIAL,
  );

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button
          type="button"
          variant="danger"
          size="sm"
          aria-label={ariaLabel}
          onClick={open}
        >
          폐기
        </Button>
      )}
      title="초대코드 폐기"
      description="되돌릴 수 없습니다. 폐기한 코드로는 가입할 수 없습니다."
      reasonLabel="폐기 사유"
      reasonPlaceholder="예: 잘못된 학생에게 발급함"
      confirmLabel="폐기"
      pendingLabel="폐기 중…"
      action={formAction}
      pending={pending}
      state={state}
    >
      <input type="hidden" name="inviteId" value={inviteId} />
    </ConfirmDialog>
  );
}
