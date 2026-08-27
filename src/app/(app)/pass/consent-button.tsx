"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EMPTY_PASS_STATE } from "./action-state";
import { consentAction } from "./actions";

/** 보호자 확인. 교사가 대신 기록하는 길은 승인 화면에 있고 여기는 보호자 전용이다. */
export function ConsentButton({ passId }: { passId: string }) {
  const [state, action, pending] = useActionState(consentAction, EMPTY_PASS_STATE);

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button type="button" size="sm" onClick={open} className="mt-2">
          보호자 확인
        </Button>
      )}
      title="보호자 확인"
      description="자녀의 외박을 보호자로서 확인합니다."
      // 모달의 사유 칸이 곧 consentNote다 — 담을 자리가 이미 있어 새로 만들지 않는다.
      reasonLabel="남길 말"
      reasonPlaceholder="예: 집에서 자고 옵니다"
      reasonName="consentNote"
      reasonRequired={false}
      confirmLabel="확인"
      confirmVariant="primary"
      pendingLabel="확인하는 중…"
      action={action}
      pending={pending}
      state={state}
    >
      <input type="hidden" name="passId" value={passId} />
    </ConfirmDialog>
  );
}
