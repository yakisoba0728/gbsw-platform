export type PassActionState = {
  error: string | null;
  ok: boolean;
};

export const EMPTY_PASS_STATE: PassActionState = { error: null, ok: false };
