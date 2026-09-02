export type UserActionState = {
  ok: boolean;
  error: string | null;
  tempPassword: string | null;
};

export const USER_ACTION_INITIAL: UserActionState = {
  ok: false,
  error: null,
  tempPassword: null,
};

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
  changed: string[] | null;
  values: UpdateUserValues | null;
};

export const UPDATE_USER_INITIAL: UpdateUserState = {
  error: null,
  changed: null,
  values: null,
};
