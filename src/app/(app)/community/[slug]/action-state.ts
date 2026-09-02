export type PostFormValues = { title: string; body: string };

export type PostFormState = {
  ok: boolean;
  error: string | null;
  values?: PostFormValues;
};

export const EMPTY_POST_STATE: PostFormState = { ok: false, error: null };
