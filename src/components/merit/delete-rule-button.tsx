"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * 이 버튼이 기대하는 서버 액션의 상태 계약. RuleFormState와 같은 모양이지만
 * 거기서 가져오지 않는다 — components/가 app/을 알면 안 된다.
 */
type DeleteActionState = {
  ok: boolean;
  error: string | null;
};

/**
 * 규정 삭제. 되돌릴 수 없는 동작이라 앱의 다른 파괴적 동작과 같은 모달을 쓴다 —
 * 여기만 네이티브 confirm()이면 문구·생김새·접근성이 앱 밖에 있게 된다.
 *
 * 사유는 감사로그에만 남는다. 부여 화면에서 항목이 사라진 뒤 "왜 없어졌나"를
 * 되짚을 자료가 그것뿐이다.
 */
export function DeleteRuleButton({
  ruleId,
  label,
  deleteAction,
  initialState,
}: {
  ruleId: string;
  /** 무엇을 지우는지 모달에 적는다 — 표에서 줄을 잘못 짚는 사고를 막는다. */
  label: string;
  /** `app/(app)/admin/merit/rules/actions.ts`의 deleteRuleAction. */
  deleteAction: (
    prev: DeleteActionState,
    formData: FormData,
  ) => Promise<DeleteActionState>;
  /** 그 액션의 초기 상태 — `EMPTY_RULE_FORM_STATE`. */
  initialState: DeleteActionState;
}) {
  const [state, formAction, pending] = useActionState(deleteAction, initialState);

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button type="button" variant="danger" size="sm" onClick={open}>
          삭제
        </Button>
      )}
      title="규정 삭제"
      description={
        <>
          <span className="font-medium text-ink">{label}</span> 규정이 목록과 부여
          화면에서 사라집니다. 되돌릴 수 없습니다.
        </>
      }
      reasonLabel="삭제 사유"
      reasonPlaceholder="예: 규정 개정으로 항목이 없어짐"
      confirmLabel="삭제"
      pendingLabel="삭제 중…"
      action={formAction}
      pending={pending}
      state={state}
    >
      <input type="hidden" name="ruleId" value={ruleId} />
    </ConfirmDialog>
  );
}
