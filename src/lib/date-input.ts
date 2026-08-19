import { z } from "zod";

const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD`가 실제 그레고리력 날짜이며 입력 정규형 그대로인지 확인한다. */
export function isCanonicalDateInput(value: string): boolean {
  const match = DATE_INPUT_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Date.UTC는 0~99년을 1900대로 보정한다. epoch에서 시작해 연·월·일을 한 번에
  // 지정해야 2월 29일을 임시 1900년(평년) 기준으로 3월로 넘기지 않는다.
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * 날짜 입력 경계가 모두 같은 달력 판정을 쓰도록 만드는 공통 Zod 스키마.
 * 화면별 기존 문구는 유지할 수 있게 두 문구만 인자로 받는다.
 */
export function canonicalDateInputSchema(
  formatMessage: string,
  invalidDateMessage: string,
) {
  return z
    .string()
    .regex(DATE_INPUT_PATTERN, formatMessage)
    .refine(isCanonicalDateInput, invalidDateMessage);
}
