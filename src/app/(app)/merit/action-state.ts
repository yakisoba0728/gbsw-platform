export type MeritActionState = {
  error: string | null;
  ok: boolean;
  count: number | null;
  note?: string;
};

export const EMPTY_MERIT_STATE: MeritActionState = {
  error: null,
  ok: false,
  count: null,
};
