export type RuleFormValues = {
  ruleId?: string;
  kind?: string;
  label: string;
  points: string;
  category: string;
  description: string;
};

export type RuleFormState = {
  error: string | null;
  ok: boolean;
  values?: RuleFormValues;
};

export const EMPTY_RULE_FORM_STATE: RuleFormState = { error: null, ok: false };
