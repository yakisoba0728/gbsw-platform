import { isCanonicalDateInput } from "@/lib/date-input";

/** 화면에 보이는 시각은 전부 KST다. 포맷터는 여기 한 곳에서만 만든다. */
export const KST = "Asia/Seoul";

const date = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: KST,
});

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: KST,
});

/** 2026. 8. 13. */
export function formatDate(value: Date): string {
  return date.format(value);
}

/** 26. 8. 13. 오전 8:13:51 — 초까지 본다 (감사로그처럼 순서를 가려야 하는 자리). */
export function formatDateTime(value: Date): string {
  return dateTime.format(value);
}

const dateTimeShort = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: KST,
});

/**
 * 26. 8. 13. 오전 8:13 — 목록용. 초가 필요 없는 자리에서는 세 글자를 아끼는 게
 * 낫다: 초까지 적으면 그 칸이 표에서 폭을 더 가져가고, 밀려난 만큼 옆의 긴 열이 눌린다.
 */
export function formatDateTimeShort(value: Date): string {
  return dateTimeShort.format(value);
}

const timeShort = new Intl.DateTimeFormat("ko-KR", {
  timeStyle: "short",
  timeZone: KST,
});

/** 오후 5:17 — 날짜가 이미 위에 적힌 자리(날짜별로 묶은 목록)에서 쓴다. */
export function formatTimeShort(value: Date): string {
  return timeShort.format(value);
}

const monthDayTime = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: KST,
});

/**
 * 8. 25. 오후 5:59 — 한 줄에 들어가야 하는 표의 시각 열용. 연도를 뺀다:
 * 목록은 최신순이라 화면에 보이는 것은 거의 올해이고, 연도까지 적으면 그 열이
 * 두 줄로 접혀 표 전체가 두 배로 두꺼워진다.
 */
export function formatMonthDayTime(value: Date): string {
  return monthDayTime.format(value);
}

const monthDay = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  timeZone: KST,
});

/**
 * 8. 26. — 기간을 「8. 20. ~ 8. 26.」처럼 한 줄에 적을 때 쓴다. 연도를 뺀다:
 * 창이 이레라 두 끝이 같은 해이고, `formatKstDay`는 요일이 붙어 범위로는 길다.
 */
export function formatMonthDay(value: Date): string {
  return monthDay.format(value);
}

const dayLabel = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
  timeZone: KST,
});

/** 8월 25일 (화) — 날짜 구분선용. 연도는 넣지 않는다(구분선 옆에 함께 적는다). */
export function formatKstDay(value: Date): string {
  return dayLabel.format(value);
}

const sheetDateTime = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: KST,
});

/**
 * 2026-08-26 09:03:41 — 엑셀 시트용. 시트는 정렬해 보라고 내보내는 것인데
 * 화면용 `formatDateTime`(26. 8. 26. 오전 9:03:41)을 그대로 적으면 글자로 정렬돼
 * 12월이 8월보다 앞에 선다. 이 형태는 글자순이 곧 시각순이다.
 */
export function formatDateTimeSheet(value: Date): string {
  return sheetDateTime.format(value);
}

/**
 * `<input type="date">`에 넣을 `YYYY-MM-DD`. 엑셀 시트의 날짜 열도 이것을 쓴다 —
 * 같은 이유로 글자순이 곧 날짜순이어야 한다.
 * 생년월일은 KST 기준 날짜여야 한다 — UTC로 자르면 하루 밀린다.
 */
export function formatDateInput(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: KST,
  }).format(value);
  return parts; // en-CA는 YYYY-MM-DD로 낸다
}

/**
 * `YYYY-MM-DD`를 KST 자정 Date로 만든다. UTC 자정으로 저장하면 화면은 멀쩡한데
 * 순간값이 9시간 어긋나, 이름+생년월일 대조에서만 조용히 갈린다.
 */
export function parseDateInputKst(value: string): Date {
  if (!isCanonicalDateInput(value)) {
    throw new RangeError(`Invalid canonical date input: ${value}`);
  }
  return new Date(`${value}T00:00:00+09:00`);
}

/** 두 시각이 KST 기준 같은 날인가. 밀리초 비교는 안 된다 — 발생일은 자정이다. */
export function isSameKstDate(a: Date, b: Date): boolean {
  return formatDateInput(a) === formatDateInput(b);
}

/** 그 시각이 속한 KST 날짜의 자정. 발생일(occurredOn)과 같은 눈금에 맞춘다. */
export function kstDayStart(value: Date): Date {
  return parseDateInputKst(formatDateInput(value));
}

/**
 * KST 기준 시(0~23). 서버는 UTC로 도는데 시간대에 따라 달라지는 화면이
 * UTC를 따르면 한국 아침 8시에 밤 인사가 나간다.
 */
export function kstHour(value: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: KST,
    }).format(value),
  );
}
