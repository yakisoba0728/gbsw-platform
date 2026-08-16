export type RuleFormState = {
  error: string | null;
  ok: boolean;
};

export const EMPTY_RULE_FORM_STATE: RuleFormState = { error: null, ok: false };
