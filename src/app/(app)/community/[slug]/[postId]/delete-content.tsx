"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EMPTY_POST_STATE } from "../action-state";
import { deleteCommentAction, deletePostAction } from "../actions";

const CONTENT = {
  post: {
    label: "글",
    field: "postId",
    action: deletePostAction,
    description: "이 글이 목록에서 사라집니다. 댓글도 함께 보이지 않습니다.",
  },
  comment: {
    label: "댓글",
    field: "commentId",
    action: deleteCommentAction,
    description: "이 댓글이 사라집니다.",
  },
};

export function DeleteContent({
  kind,
  id,
  byModerator,
  accessibleName,
}: {
  kind: keyof typeof CONTENT;
  id: string;
  byModerator: boolean;
  accessibleName: string;
}) {
  const content = CONTENT[kind];
  const [state, formAction, pending] = useActionState(
    content.action,
    EMPTY_POST_STATE,
  );

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button variant="ghost" size="sm" aria-label={accessibleName} onClick={open}>
          삭제
        </Button>
      )}
      title={`${content.label}을 삭제합니다`}
      description={
        byModerator
          ? `다른 사람의 ${content.label}을 삭제합니다. 사유가 감사 기록에 남습니다.`
          : content.description
      }
      reasonLabel="삭제 사유"
      reasonRequired={byModerator}
      confirmLabel="삭제"
      pendingLabel="삭제하는 중…"
      action={formAction}
      pending={pending}
      state={state}
    >
      <input type="hidden" name={content.field} value={id} />
    </ConfirmDialog>
  );
}
