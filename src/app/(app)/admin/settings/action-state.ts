export type ThresholdFormState = {
  error: string | null;
  ok: boolean;
  values: { warn: string; danger: string } | null;
};

export const EMPTY_THRESHOLD_FORM_STATE: ThresholdFormState = {
  error: null,
  ok: false,
  values: null,
};
