"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EMPTY_COMMUNITY_FORM_STATE } from "../action-state";
import { deleteCommunityAction } from "../actions";

export function DeleteCommunity({
  communityId,
  updatedAt,
  name,
}: {
  communityId: string;
  updatedAt: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    deleteCommunityAction,
    EMPTY_COMMUNITY_FORM_STATE,
  );

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button variant="danger" onClick={open}>
          게시판 제거
        </Button>
      )}
      title={`「${name}」을 제거합니다`}
      description="이 게시판이 목록과 주소에서 사라집니다. 글은 지워지지 않지만 아무도 볼 수 없게 됩니다. 되돌릴 수 없습니다."
      reasonLabel="제거 사유"
      reasonPlaceholder="예: 학기가 끝나 더 쓰지 않습니다"
      confirmVariant="danger"
      confirmLabel="제거"
      pendingLabel="제거하는 중…"
      action={formAction}
      pending={pending}
      state={state}
    >
      <input type="hidden" name="communityId" value={communityId} />
      <input type="hidden" name="updatedAt" value={updatedAt} />
    </ConfirmDialog>
  );
}
