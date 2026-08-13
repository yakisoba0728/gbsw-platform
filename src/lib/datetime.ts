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

/**
 * `formatDateInput`의 역함수. `<input type="date">`의 `YYYY-MM-DD`를 KST 자정 Date로 만든다.
 *
 * 생년월일은 "날짜"만 의미가 있고 시각은 의미가 없다. 그래도 Date로 저장하려면 자정을
 * 어느 시간대 기준으로 볼지 정해야 한다. UTC 자정으로 저장해도 KST로 표시하면(09:00으로
 * 밀릴 뿐 날짜는 안 바뀌므로) 화면엔 문제가 없어 보인다 — 하지만 저장된 순간(instant)
 * 자체는 KST 자정으로 저장했을 때와 9시간 다르다. 화면 표시만 보면 안 드러나다가,
 * 이름+생년월일로 학생을 매칭하는 등 값을 직접 비교하는 순간 어긋난다. 그래서 생년월일을
 * 만드는 모든 경로(가입·관리자수정)가 반드시 이 함수 하나만 거치게 한다.
 */
export function parseDateInputKst(value: string): Date {
  return new Date(`${value}T00:00:00+09:00`);
}
