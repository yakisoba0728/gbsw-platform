import { formatDateInput, parseDateTimeInputKst } from "@/lib/datetime";
import { PassError } from "./pass.error";
import type { IssuePassInput, RequestPassInput } from "./pass.schema";

/**
 * 유효 창. 순수 함수이고 `now`를 인자로 받는다 — 서비스가 시계를 쥐고
 * 테스트가 그것을 대신 쥔다.
 *
 * **유형이 계산을 가르지 않는다.** 둘 다 「날짜 + 시각」 둘을 그대로 KST 순간으로
 * 옮긴다. 다른 것은 날짜 칸의 수뿐이다 — 외출은 하나(양끝이 같은 날), 외박은 둘.
 * 유형이 뒤에서 갈리는 자리는 최대 기간(여기)과 보호자 확인(`requiresConsent`)뿐이다.
 */

/** 외박 최대 일수. 그보다 길면 출입증이 아니라 결석 처리의 영역이다. */
export const MAX_OVERNIGHT_DAYS = 7;

/**
 * 시작이 지났다고 막기까지의 유예(분). 14:00 외출을 13:59에 적다가 14:01에
 * 내는 것은 실수가 아니다.
 */
export const START_GRACE_MINUTES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export function requestWindow(
  input: RequestPassInput,
  now: Date,
): { startAt: Date; endAt: Date } {
  // 외출은 양끝이 같은 날이다 — 스키마가 날짜를 하나만 받는 것이 곧 그 보증이다.
  const dates =
    input.type === "OUTING"
      ? { start: input.date, end: input.date }
      : { start: input.startDate, end: input.endDate };

  const window = {
    startAt: parseDateTimeInputKst(dates.start, input.startTime),
    endAt: parseDateTimeInputKst(dates.end, input.endTime),
  };

  assertOrdered(window);
  assertNotTooLong(input.type, window);
  assertNotStarted(window, now);
  return window;
}

export function issueWindow(
  input: IssuePassInput,
  now: Date,
): { startAt: Date; endAt: Date } {
  // 「지금 내보낸다」이므로 시작은 언제나 지금이다. START_IN_PAST가 나올 자리가 없다.
  // 외출은 종료 날짜를 받지 않으므로 오늘이다 — KST로 집는다(UTC로 자르면 밤 9시
  // 이후 하루 밀린다).
  const endDate = input.type === "OUTING" ? formatDateInput(now) : input.endDate;

  const window = { startAt: now, endAt: parseDateTimeInputKst(endDate, input.endTime) };
  assertOrdered(window);
  assertNotTooLong(input.type, window);
  return window;
}

function assertOrdered({ startAt, endAt }: { startAt: Date; endAt: Date }): void {
  if (endAt.getTime() <= startAt.getTime()) throw new PassError("INVALID_PERIOD");
}

/**
 * **시간으로 센다 — 168시간.** 자정~자정이던 시절에는 날짜 빼기가 곧 일수였지만
 * 시각이 붙은 지금은 「7박」의 경계가 시각에 따라 흔들린다. 금요일 18시에 나가
 * 다음 주 금요일 18시에 돌아오는 것까지가 이레다.
 */
function assertNotTooLong(
  type: RequestPassInput["type"],
  { startAt, endAt }: { startAt: Date; endAt: Date },
): void {
  if (type !== "OVERNIGHT") return;
  if (endAt.getTime() - startAt.getTime() > MAX_OVERNIGHT_DAYS * DAY_MS) {
    throw new PassError("PERIOD_TOO_LONG");
  }
}

/**
 * 이미 지난 시각으로 신청할 수는 없다. 10분 유예 — 14:00 외출을 13:59에 적다가
 * 14:01에 내는 것은 실수가 아니다.
 */
function assertNotStarted({ startAt }: { startAt: Date }, now: Date): void {
  if (startAt.getTime() < now.getTime() - START_GRACE_MINUTES * 60 * 1000) {
    throw new PassError("START_IN_PAST");
  }
}
