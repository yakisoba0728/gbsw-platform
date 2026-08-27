/**
 * 글·댓글 폼이 되돌려 받는 값.
 *
 * `error`가 optional이 아니라 `string | null`인 것은 `ConfirmDialogState`와
 * 같은 모양이어야 해서다 — 삭제 모달들이 이 상태를 그대로 받는다.
 */
export type PostFormValues = { title: string; body: string };

export type PostFormState = {
  ok: boolean;
  error: string | null;
  values?: PostFormValues;
};

export const EMPTY_POST_STATE: PostFormState = { ok: false, error: null };
