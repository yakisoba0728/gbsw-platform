export type MeritActionState = {
  error: string | null;
  ok: boolean;
  /** 일괄 부여에서 실제로 들어간 건수. 단건이면 1, 취소면 null. */
  count: number | null;
};

export const EMPTY_MERIT_STATE: MeritActionState = {
  error: null,
  ok: false,
  count: null,
};
