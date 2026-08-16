"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EMPTY_MERIT_STATE } from "@/app/(app)/merit/action-state";
import { cancelAction } from "@/app/(app)/merit/actions";

/**
 * 단건 취소. 사유가 필수라 confirm()만으로는 부족하다.
 *
 * 예전에는 이 파일이 모달을 손으로 만들었다(`fixed inset-0` 오버레이).
 * 포커스 가두기·Esc 닫기·뒤쪽 요소 비활성화가 전부 없었고, 열려 있는 동안
 * 트리거를 렌더에서 빼버려 **모달이 열리는 순간 포커스가 `<body>`로 떨어졌다** —
 * 키보드만 쓰는 사람은 모달 안으로 들어갈 방법이 없었다. 그 셋은 `<dialog>`의
 * `showModal()`이 공짜로 해 주고, 그것을 `ui/ConfirmDialog`가 들고 있다.
 *
 * 여는 버튼은 표 안 작은 글씨(높이 19px)였다. **야간 점호 중 사감이 휴대폰으로
 * 누르는 자리**라 같은 성격의 다른 화면(초대 폐기)과 같은 규격으로 맞춘다.
 */
export function CancelButton({
  awardId,
  studentProfileId,
}: {
  awardId: string;
  studentProfileId: string;
}) {
  const [state, formAction, pending] = useActionState(cancelAction, EMPTY_MERIT_STATE);

  return (
    <ConfirmDialog
      trigger={(open) => (
        <Button type="button" variant="danger" size="sm" onClick={open}>
          취소
        </Button>
      )}
      title="상벌점 취소"
      description="이 상벌점 내역을 취소합니다. 학생 순점수에 즉시 반영 해제됩니다."
      reasonLabel="취소 사유"
      reasonPlaceholder="취소 사유를 입력해 주세요"
      confirmLabel="취소하기"
      pendingLabel="취소하는 중…"
      action={formAction}
      pending={pending}
      state={state}
    >
      <input type="hidden" name="awardId" value={awardId} />
      <input type="hidden" name="studentProfileId" value={studentProfileId} />
    </ConfirmDialog>
  );
}
