/**
 * 화면에 보이는 시각은 전부 KST다.
 *
 * 서버가 어느 타임존에 있든(컨테이너는 보통 UTC) 사용자는 한국 시각으로 본다.
 * 포맷터를 페이지마다 만들면 timeZone 지정을 빠뜨리는 순간 조용히 어긋나므로
 * 여기 한 곳에서만 만든다.
 */
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

/** 26. 8. 13. 오전 8:13:51 */
export function formatDateTime(value: Date): string {
  return dateTime.format(value);
}

/**
 * `<input type="date">`에 넣을 `YYYY-MM-DD`.
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
