export type ThresholdFormState = {
  error: string | null;
  ok: boolean;
};

export const EMPTY_THRESHOLD_FORM_STATE: ThresholdFormState = {
  error: null,
  ok: false,
};
