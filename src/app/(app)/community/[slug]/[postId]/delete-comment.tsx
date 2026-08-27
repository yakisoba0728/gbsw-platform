"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EMPTY_POST_STATE } from "../action-state";
import { deleteCommentAction } from "../actions";

export function DeleteComment({
  commentId,
  byModerator,
}: {
  commentId: string;
  byModerator: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    deleteCommentAction,
    EMPTY_POST_STATE,
  );

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button variant="ghost" size="sm" onClick={open}>
          삭제
        </Button>
      )}
      title="댓글을 삭제합니다"
      description={
        byModerator
          ? "다른 사람의 댓글을 삭제합니다. 사유가 감사 기록에 남습니다."
          : "이 댓글이 사라집니다."
      }
      reasonLabel="삭제 사유"
      reasonRequired={byModerator}
      confirmVariant="danger"
      confirmLabel="삭제"
      pendingLabel="삭제하는 중…"
      action={formAction}
      pending={pending}
      state={state}
    >
      <input type="hidden" name="commentId" value={commentId} />
    </ConfirmDialog>
  );
}
