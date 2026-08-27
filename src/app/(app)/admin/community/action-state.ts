/**
 * 폼이 되돌려 받는 값. 실패 상태에 제출값을 함께 싣는다 — React 19가 액션이
 * 끝난 폼을 리셋하므로, 이 값이 없으면 화면이 오류만 보여 주고 입력은 지운다.
 */
export type CommunityFormValues = {
  slug: string;
  name: string;
  description: string;
  readRoles: string[];
  writeRoles: string[];
  anonymous: boolean;
  allowAttachments: boolean;
  sortOrder: string;
};

/**
 * `error`가 optional이 아니라 `string | null`인 것은 `ConfirmDialogState`와
 * 같은 모양이어야 해서다 — 제거 모달이 이 상태를 그대로 받는다.
 */
export type CommunityFormState = {
  ok: boolean;
  error: string | null;
  values?: CommunityFormValues;
};

export const EMPTY_COMMUNITY_FORM_STATE: CommunityFormState = {
  ok: false,
  error: null,
};
