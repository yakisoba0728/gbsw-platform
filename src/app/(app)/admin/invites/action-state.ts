export type InviteFormValues = {
  name: string;
  expiresInDays: string;
  birthDate?: string;
  grade?: string;
  classNo?: string;
  number?: string;
  studentId?: string;
};

export type InviteFormState = {
  error: string | null;
  code: string | null;
  values?: InviteFormValues;
};

export const INVITE_FORM_INITIAL: InviteFormState = { error: null, code: null };

export type RevokeState = { ok: boolean; error: string | null };

export const REVOKE_INITIAL: RevokeState = { ok: false, error: null };
