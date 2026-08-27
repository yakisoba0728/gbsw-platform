"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EMPTY_POST_STATE } from "../action-state";
import { deletePostAction } from "../actions";

/**
 * 글 삭제. **남의 글을 지울 때만 사유가 필수다** — 내 글을 지우는 데 사유를
 * 물을 이유가 없고, 교사가 남의 글을 지운 일은 나중에 설명이 필요하다.
 */
export function DeletePost({
  postId,
  byModerator,
}: {
  postId: string;
  byModerator: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    deletePostAction,
    EMPTY_POST_STATE,
  );

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button variant="ghost" size="sm" onClick={open}>
          삭제
        </Button>
      )}
      title="글을 삭제합니다"
      description={
        byModerator
          ? "다른 사람의 글을 삭제합니다. 사유가 감사 기록에 남습니다."
          : "이 글이 목록에서 사라집니다. 댓글도 함께 보이지 않습니다."
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
      <input type="hidden" name="postId" value={postId} />
    </ConfirmDialog>
  );
}
