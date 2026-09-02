import { z } from "zod";

const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCanonicalDateInput(value: string): boolean {
  const match = DATE_INPUT_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function canonicalDateInputSchema(
  formatMessage: string,
  invalidDateMessage: string,
) {
  return z
    .string()
    .regex(DATE_INPUT_PATTERN, formatMessage)
    .refine(isCanonicalDateInput, invalidDateMessage);
}
