"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Note } from "@/components/ui/note";
import { EMPTY_PASS_STATE } from "./action-state";
import { approveAction, rejectAction } from "./actions";

export function DecisionPanel({
  passId,
  needsProxyConsent,
}: {
  passId: string;
  needsProxyConsent: boolean;
}) {
  const [approveState, approve, approving] = useActionState(
    approveAction,
    EMPTY_PASS_STATE,
  );
  const [rejectState, reject, rejecting] = useActionState(
    rejectAction,
    EMPTY_PASS_STATE,
  );
  const error = approveState.error ?? rejectState.error;

  return (
    <div className="mt-3 w-full space-y-3">
      {needsProxyConsent && (
        <Note tone="warn">
          보호자 확인되지 않음 · 보호자가 확인하거나 전화 확인을 대행해야 승인할 수
          있습니다.
        </Note>
      )}

      <div className="flex flex-wrap gap-2">
        <ConfirmDialog
          trigger={(open) => (
            <Button type="button" size="sm" onClick={open}>
              승인
            </Button>
          )}
          title="출입증 승인"
          description={
            needsProxyConsent
              ? "보호자 확인이 아직 없습니다. 전화로 확인했다면 아래를 체크하세요."
              : "이 신청을 승인합니다."
          }
          extra={
            needsProxyConsent ? (
              <CheckboxField
                name="byProxy"
                value="on"
                label="전화로 보호자 확인함"
                required
              />
            ) : undefined
          }
          reasonLabel={needsProxyConsent ? "확인 방법" : "승인 메모"}
          reasonPlaceholder={
            needsProxyConsent ? "예: 어머니와 통화" : "예: 병원 예약 확인함"
          }
          reasonName={needsProxyConsent ? "consentNote" : "decisionNote"}
          reasonRequired={false}
          confirmLabel="승인"
          confirmVariant="primary"
          pendingLabel="승인 중…"
          action={approve}
          pending={approving}
          state={approveState}
        >
          <input type="hidden" name="passId" value={passId} />
        </ConfirmDialog>

        <ConfirmDialog
          trigger={(open) => (
            <Button type="button" variant="danger" size="sm" onClick={open}>
              반려
            </Button>
          )}
          title="출입증 반려"
          description="반려하면 학생에게 사유가 그대로 보입니다."
          reasonLabel="반려 사유"
          reasonPlaceholder="예: 시험 기간에는 외박이 안 됩니다"
          reasonName="decisionNote"
          confirmLabel="반려"
          pendingLabel="반려 중…"
          action={reject}
          pending={rejecting}
          state={rejectState}
        >
          <input type="hidden" name="passId" value={passId} />
        </ConfirmDialog>
      </div>

      {error && <Note tone="error">{error}</Note>}
    </div>
  );
}
