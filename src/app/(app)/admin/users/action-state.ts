/*
 * 서버 액션의 상태 타입과 초기값.
 *
 * `"use server"` 모듈은 **async 함수만** 내보낼 수 있다.
 * 거기서 일반 객체를 export하면 클라이언트에서 undefined로 들어와
 * useActionState의 초기 상태가 비어버린다. 그래서 값은 여기 둔다.
 */

export type UserActionState = {
  error: string | null;
  /** 비밀번호 초기화 결과 — 화면에 한 번만 보여준다. */
  tempPassword: string | null;
  targetId: string | null;
};

export const USER_ACTION_INITIAL: UserActionState = {
  error: null,
  tempPassword: null,
  targetId: null,
};

export type UpdateUserState = {
  error: string | null;
  /** 실제로 바뀐 항목. 빈 배열이면 변경 없음. */
  changed: string[] | null;
};

export const UPDATE_USER_INITIAL: UpdateUserState = {
  error: null,
  changed: null,
};
