"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { REVOKE_INITIAL } from "./action-state";
import { revokeInviteAction } from "./actions";

/**
 * 초대코드 폐기. 되돌릴 수 없는 동작이라 앱의 다른 파괴적 동작과 같은 모달을 쓴다 —
 * 상벌점 취소·규정 삭제가 사유를 받는 동안 이것만 표 한 줄에서 곧바로 실행됐다.
 *
 * 사유는 감사로그에만 남는다. 폐기하면 목록에서 대기 상태가 사라지는데, 「왜
 * 없앴나」를 되짚을 자료가 거기밖에 없다 — 로그 화면이 「사유: …」로 그려 준다.
 */
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
