"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * 이 버튼이 기대하는 서버 액션의 상태 계약. MeritActionState와 같은 모양이지만
 * 거기서 가져오지 않는다 — components/가 app/을 알면 안 된다. 어긋나면 화면 쪽
 * 타입 검사가 막는다(함수 매개변수는 반공변이라 필드가 늘거나 줄면 안 들어간다).
 */
type CancelActionState = {
  ok: boolean;
  error: string | null;
  count: number | null;
};

/**
 * 단건 취소. 사유가 필수라 confirm()만으로는 부족하다.
 * 서버 액션과 초기 상태를 화면에서 주입받는다 — 공용 컴포넌트가 app/의 경로를
 * 알면 그 화면을 옮길 때 이것을 쓰는 세 화면이 함께 깨진다.
 */
export function CancelButton({
  awardId,
  studentProfileId,
  cancelAction,
  initialState,
}: {
  awardId: string;
  studentProfileId: string;
  /** `app/(app)/merit/actions.ts`의 cancelAction. */
  cancelAction: (
    prev: CancelActionState,
    formData: FormData,
  ) => Promise<CancelActionState>;
  /** 그 액션의 초기 상태 — `EMPTY_MERIT_STATE`. */
  initialState: CancelActionState;
}) {
  const [state, formAction, pending] = useActionState(cancelAction, initialState);

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button type="button" variant="danger" size="sm" onClick={open}>
          취소
        </Button>
      )}
      title="상벌점 취소"
      description="기록은 남고 합계에서만 빠집니다."
      reasonLabel="취소 사유"
      reasonPlaceholder="예: 항목을 잘못 골라 부여함"
      confirmLabel="취소 처리"
      pendingLabel="취소 중…"
      action={formAction}
      pending={pending}
      state={state}
    >
      <input type="hidden" name="awardId" value={awardId} />
      <input type="hidden" name="studentProfileId" value={studentProfileId} />
    </ConfirmDialog>
  );
}
