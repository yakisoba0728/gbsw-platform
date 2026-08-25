/*
 * 서버 액션의 상태 타입과 초기값.
 *
 * `"use server"` 모듈은 **async 함수만** 내보낼 수 있다.
 * 거기서 일반 객체를 export하면 클라이언트에서 undefined로 들어와
 * useActionState의 초기 상태가 비어버린다. 그래서 값은 여기 둔다.
 * (admin/users·admin/students·import·merit와 같은 관례)
 */

/**
 * 실패해서 되돌아온 폼이 다시 채워 넣을 제출값.
 *
 * React 19는 `<form action={서버액션}>`을 액션이 끝날 때 **성공·실패를 가리지 않고**
 * reset()한다. 발급 세 폼은 값을 서버에서 받아 오지 않으므로, 실패 상태가 값을 들고
 * 오지 않으면 이름·생년월일·학년·반·번호를 처음부터 다시 친다. 성공하면 코드를
 * 보여 주고 폼은 비어야 하므로 싣지 않는다.
 */
export type InviteFormValues = {
  name: string;
  expiresInDays: string;
  /** 학생 코드 발급에서만 채운다. */
  birthDate?: string;
  grade?: string;
  classNo?: string;
  number?: string;
  /** 학부모 코드 발급에서만 채운다. */
  studentId?: string;
};

export type InviteFormState = {
  error: string | null;
  /** 발급 성공 시 화면에 한 번 보여줄 코드 */
  code: string | null;
  /** 실패했을 때만 실린다. */
  values?: InviteFormValues;
};

export const INVITE_FORM_INITIAL: InviteFormState = { error: null, code: null };

/**
 * 폐기 결과. `ok`가 필요한 이유는 확인 모달이 성공했을 때만 닫히기 때문이다 —
 * 실패하면 쓰던 사유를 남긴 채 열어 두어야 고쳐서 다시 누를 수 있다.
 */
export type RevokeState = { ok: boolean; error: string | null };

export const REVOKE_INITIAL: RevokeState = { ok: false, error: null };
