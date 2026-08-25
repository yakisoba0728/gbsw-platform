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

/**
 * 정보 수정 폼이 보내는 칸 그대로 — 검증 전 문자열이라 형식이 틀린 값도 담긴다.
 * 틀린 값이야말로 되돌려 그려야 교사가 그 자리를 고칠 수 있다.
 */
export type UpdateUserValues = {
  name: string;
  email: string;
  phone: string;
  birthDate: string;
  grade: string;
  classNo: string;
  number: string;
};

export type UpdateUserState = {
  error: string | null;
  /** 실제로 바뀐 항목. 빈 배열이면 변경 없음. */
  changed: string[] | null;
  /**
   * 저장이 거부됐을 때 폼이 되돌려 그릴 제출값. React 19는 서버 액션이 끝나면
   * 성공·실패를 가리지 않고 폼을 reset()하므로, 비제어 칸이 되감기지 않으려면
   * 제출값이 defaultValue로 다시 내려가야 한다. 성공하면 null이다 —
   * revalidate가 가져온 새 서버 값이 보여야 한다.
   */
  values: UpdateUserValues | null;
};

export const UPDATE_USER_INITIAL: UpdateUserState = {
  error: null,
  changed: null,
  values: null,
};
