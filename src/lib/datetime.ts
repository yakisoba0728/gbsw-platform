import { isCanonicalDateInput } from "@/lib/date-input";

export const KST = "Asia/Seoul";

function formatter(options: Intl.DateTimeFormatOptions, locale = "ko-KR") {
  const format = new Intl.DateTimeFormat(locale, { ...options, timeZone: KST });
  return (value: Date): string => format.format(value);
}

/** 2026. 8. 13. */
export const formatDate = formatter({ dateStyle: "medium" });
/** 26. 8. 13. 오전 8:13:51 */
export const formatDateTime = formatter({ dateStyle: "short", timeStyle: "medium" });
/** 26. 8. 13. 오전 8:13 */
export const formatDateTimeShort = formatter({ dateStyle: "short", timeStyle: "short" });
/** 오후 5:17 */
export const formatTimeShort = formatter({ timeStyle: "short" });
/** 오후 05:17:23 — 시계의 자릿수를 고정해 갱신 시 너비 변화 방지. */
export const formatClock = formatter({
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});
/** 8. 25. 오후 5:59 */
export const formatMonthDayTime = formatter({
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
/** 8. 26. */
export const formatMonthDay = formatter({ month: "numeric", day: "numeric" });
/** 2026-08-26 09:03:41 — 엑셀에서 글자순으로 정렬할 수 있는 형식. */
export const formatDateTimeSheet = formatter(
  { dateStyle: "short", timeStyle: "medium" },
  "sv-SE",
);
/** KST 기준 YYYY-MM-DD. UTC로 자르면 생년월일이 하루 밀릴 수 있다. */
export const formatDateInput = formatter(
  { year: "numeric", month: "2-digit", day: "2-digit" },
  "en-CA",
);

/** 날짜만 있는 값도 모든 쓰기 경로에서 KST 자정으로 저장한다. */
export function parseDateInputKst(value: string): Date {
  if (!isCanonicalDateInput(value)) {
    throw new RangeError(`Invalid canonical date input: ${value}`);
  }
  return new Date(`${value}T00:00:00+09:00`);
}

const CANONICAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isCanonicalTimeInput(value: string): boolean {
  return CANONICAL_TIME.test(value);
}

export function parseDateTimeInputKst(date: string, time: string): Date {
  if (!isCanonicalDateInput(date)) {
    throw new RangeError(`Invalid canonical date input: ${date}`);
  }
  if (!isCanonicalTimeInput(time)) {
    throw new RangeError(`Invalid canonical time input: ${time}`);
  }
  return new Date(`${date}T${time}:00+09:00`);
}

/** 종료일 전체를 포함하는 조회의 열린 상한. KST는 서머타임이 없다. */
export function kstNextDayStart(dateInput: string): Date {
  return new Date(parseDateInputKst(dateInput).getTime() + 24 * 60 * 60 * 1000);
}

export function isSameKstDate(a: Date, b: Date): boolean {
  return formatDateInput(a) === formatDateInput(b);
}

export function kstDayStart(value: Date): Date {
  return parseDateInputKst(formatDateInput(value));
}
