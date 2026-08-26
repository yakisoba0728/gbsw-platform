"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { EMPTY_PASS_STATE } from "./action-state";
import { approveAction, rejectAction } from "./actions";

/**
 * 승인과 반려를 **폼 두 개**로 나눈다. 한 폼에 버튼 둘을 두면 useActionState가
 * 액션 하나만 받으므로 반려 사유가 승인 쪽으로도 실려 간다.
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
      <form action={approve} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="passId" value={passId} />

        {needsProxyConsent && (
          <div className="w-full space-y-2">
            <CheckboxField
              name="byProxy"
              value="on"
              label="전화로 보호자 확인함"
              required
            />
            <Input
              name="consentNote"
              size="sm"
              maxLength={100}
              placeholder="확인 방법 (예: 어머니와 통화)"
            />
          </div>
        )}

        <Button type="submit" size="sm" disabled={approving}>
          {approving ? "승인 중…" : "승인"}
        </Button>
      </form>

      <form action={reject} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="passId" value={passId} />
        <Input
          name="decisionNote"
          size="sm"
          maxLength={200}
          placeholder="반려 사유"
          required
          className="min-w-40 flex-1"
        />
        <Button type="submit" variant="danger" size="sm" disabled={rejecting}>
          {rejecting ? "반려 중…" : "반려"}
        </Button>
      </form>

      {error && <Note tone="error">{error}</Note>}
    </div>
  );
}
