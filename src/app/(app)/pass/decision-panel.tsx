"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Note } from "@/components/ui/note";
import { EMPTY_PASS_STATE } from "./action-state";
import { approveAction, rejectAction } from "./actions";

/**
 * 승인과 반려를 **모달 두 개**로 나눈다. 한 폼에 버튼 둘을 두면 useActionState가
 * 액션 하나만 받으므로 반려 사유가 승인 쪽으로도 실려 간다.
 *
 * 사유 칸의 무게가 둘에서 다르다 — 반려는 필수다(「왜 안 되는지」를 학생이 알아야
 * 다시 낸다). 승인은 선택이고, 대행 확인일 때만 확인 방법을 함께 받는다.
 */
export function DecisionPanel({
  passId,
  needsProxyConsent,
}: {
  passId: string;
  /** 외박인데 보호자 확인이 아직 없다 — 대행 체크가 있어야 승인이 열린다. */
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
          // 대행일 때 적는 「확인 방법」이 곧 승인 메모다 — consentNote에 담긴다.
          reasonLabel={needsProxyConsent ? "확인 방법" : "승인 메모"}
          reasonPlaceholder={
            needsProxyConsent ? "예: 어머니와 통화" : "예: 병원 예약 확인함"
          }
          reasonName="consentNote"
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
