/**
 * 실패해서 되돌아온 폼이 다시 채워 넣을 제출값.
 *
 * React 19는 `<form action={서버액션}>`을 액션이 끝날 때 **성공·실패를 가리지 않고**
 * reset()한다. 실패 상태가 값을 들고 오지 않으면 방금 친 입력이 통째로 사라진다 —
 * 오류 문구만 남고 항목명·점수는 빈 칸이 된다. 성공하면 목록이 새로 그려져야 하므로
 * 값을 싣지 않는다: 그때는 리셋이 옳다.
 */
export type RuleFormValues = {
  /** 인라인 수정에서만 채운다. 어느 행의 값인지 가려야 다른 행을 덮어쓰지 않는다. */
  ruleId?: string;
  /** 규정 추가에서만 채운다. 수정은 종류를 바꾸지 못한다 (updateRuleSchema에 없다). */
  kind?: string;
  label: string;
  points: string;
  category: string;
  description: string;
};

export type RuleFormState = {
  error: string | null;
  ok: boolean;
  /**
   * 실패했을 때만 실린다. 선택 필드인 이유는 삭제 모달(`DeleteRuleButton`)이
   * `{ ok, error }`만 있는 자기 상태 계약을 쓰기 때문이다 — 필수로 만들면
   * 그 계약이 이 타입에 대입되지 않아 `deleteAction` 전달이 막힌다.
   */
  values?: RuleFormValues;
};

export const EMPTY_RULE_FORM_STATE: RuleFormState = { error: null, ok: false };
