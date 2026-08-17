"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * 이 버튼이 기대하는 서버 액션의 상태 계약.
 *
 * `app/(app)/merit/action-state.ts`의 `MeritActionState`와 **같은 모양**이지만
 * 거기서 가져오지 않는다 — `components/`가 `app/`을 알게 되는 순간 이 파일을
 * 옮긴 이유가 사라진다. `ConfirmDialog`가 "서버 액션과 오류 문구 사전은
 * 화면(app/)의 것이라 여기서 import하지 않는다"고 적어 둔 것과 같은 처리다.
 *
 * 베껴 적은 것이라 언젠가 어긋날 것처럼 보이지만, 어긋나면 **화면 쪽 타입 검사가
 * 막는다.** page.tsx가 넘기는 액션은 `(MeritActionState) => Promise<…>`이고,
 * 함수 매개변수는 반공변이라 필드가 하나라도 늘거나 줄면 아래 `cancelAction`
 * 자리에 들어가지 않는다 — "여분의 필드가 있어도 통과" 같은 느슨함이 없다.
 *
 * `count`(일괄 부여 건수)는 이 버튼이 쓰지 않는다. 그래도 적는 이유가 위와 같다 —
 * 계약을 정확히 적어야 그 검사가 성립한다.
 */
type CancelActionState = {
  ok: boolean;
  error: string | null;
  count: number | null;
};

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
 *
 * ## 왜 서버 액션을 prop으로 받는가
 * 이 파일은 원래 `app/(app)/merit/students/[studentId]/`에 있었고, 이것을 쓰는
 * `components/merit/award-history.tsx`가 그 경로를 직접 import했다 — 저장소에
 * 하나뿐이던 `components/` → `app/` 역방향 의존이다. 공용 컴포넌트가 화면 한 곳의
 * 경로를 알면 그 화면을 옮기거나 지우는 순간 그 컴포넌트를 쓰는 세 화면(관리자
 * 상세·학생·학부모)이 함께 깨진다.
 *
 * 파일만 옮기면 이번엔 `app/**\/actions.ts`를 import하게 되어 방향이 그대로다.
 * 그래서 액션과 그 초기 상태를 **화면에서 주입받는다.** 서버 액션을 client
 * 컴포넌트에 prop으로 넘기는 것은 App Router가 문서로 지원하는 방식이다
 * (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`의
 * "Passing actions as props").
 *
 * 초기 상태까지 받는 이유: 여기서 `{ ok: false, error: null, count: null }`을
 * 손으로 만들면 `EMPTY_MERIT_STATE`가 두 벌이 된다. 값은 액션 쪽에 하나만 둔다.
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
