export type ThresholdFormState = {
  error: string | null;
  ok: boolean;
  /**
   * 저장이 거부됐을 때 폼이 되돌려 그릴 제출값(검증 전 문자열). React 19는
   * 서버 액션이 끝나면 성공·실패를 가리지 않고 폼을 reset()하므로, 이것을
   * defaultValue로 내려야 방금 입력한 두 숫자가 남는다. 성공하면 null이다 —
   * revalidate가 가져온 저장된 값이 보여야 한다.
   */
  values: { warn: string; danger: string } | null;
};

export const EMPTY_THRESHOLD_FORM_STATE: ThresholdFormState = {
  error: null,
  ok: false,
  values: null,
};
