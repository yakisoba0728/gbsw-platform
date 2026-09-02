export type SaveState = {
  error: string | null;
  saved: number | null;
};

export const SAVE_INITIAL: SaveState = { error: null, saved: null };

export type YearState = { error: string | null; ok: boolean };

export const YEAR_INITIAL: YearState = { error: null, ok: false };
