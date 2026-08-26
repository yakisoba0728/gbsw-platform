import {
  formatDateInput,
  kstNextDayStart,
  parseDateInputKst,
  parseDateTimeInputKst,
} from "@/lib/datetime";
import { PassError } from "./pass.error";
import type { IssuePassInput, RequestPassInput } from "./pass.schema";

/**
 * 유형별 유효 창. 순수 함수이고 `now`를 인자로 받는다 — 서비스가 시계를 쥐고
 * 테스트가 그것을 대신 쥔다.
 *
 * | 유형 | startAt | endAt |
 * |---|---|---|
 * | 외출 | 그날 KST 시각 | 같은 KST 날짜의 더 늦은 시각 |
 * | 외박 | 시작일 KST 자정 | **종료일 다음 날** KST 자정 (종료일 끝) |
 *
 * 외출이 날짜를 넘으면 그것은 외박이다 — 스키마가 유형으로 이미 갈라 놓았으므로
 * 여기서 「같은 날인가」를 따로 볼 일이 없다(외출은 date 하나만 받는다).
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
  const window =
    input.type === "OUTING"
      ? {
          startAt: parseDateTimeInputKst(input.date, input.startTime),
          endAt: parseDateTimeInputKst(input.date, input.endTime),
        }
      : {
          startAt: parseDateInputKst(input.startDate),
          endAt: kstNextDayStart(input.endDate),
        };

  assertOrdered(window);
  assertNotTooLong(input.type, window);
  assertNotStarted(input, window, now);
  return window;
}

export function issueWindow(
  input: IssuePassInput,
  now: Date,
): { startAt: Date; endAt: Date } {
  // 「지금 내보낸다」이므로 시작은 언제나 지금이다. START_IN_PAST가 나올 자리가 없다.
  // 오늘 날짜는 KST로 집는다 — UTC로 자르면 밤 9시 이후 하루 밀린다.
  const endAt =
    input.type === "OUTING"
      ? parseDateTimeInputKst(formatDateInput(now), input.endTime)
      : kstNextDayStart(input.endDate);

  const window = { startAt: now, endAt };
  assertOrdered(window);
  assertNotTooLong(input.type, window);
  return window;
}

function assertOrdered({ startAt, endAt }: { startAt: Date; endAt: Date }): void {
  if (endAt.getTime() <= startAt.getTime()) throw new PassError("INVALID_PERIOD");
}

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
 * 「지났다」의 눈금이 유형마다 다르다.
 *
 * - **외출**은 시각을 받으므로 시각으로 본다. 10분 유예 — 14:00 외출을 13:59에
 *   적다가 14:01에 내는 것은 실수가 아니다.
 * - **외박**은 날짜만 받으므로 **날짜로 본다.** 시각으로 보면 오늘 밤 외박을 낮에
 *   신청하는 **가장 흔한 경우**가 막힌다: startAt이 오늘 자정이라 오전 9시에는 이미
 *   아홉 시간 지난 것이 되기 때문이다. `YYYY-MM-DD` 문자열 비교가 곧 날짜 비교다.
 */
function assertNotStarted(
  input: RequestPassInput,
  { startAt }: { startAt: Date },
  now: Date,
): void {
  if (input.type === "OVERNIGHT") {
    if (input.startDate < formatDateInput(now)) throw new PassError("START_IN_PAST");
    return;
  }

  if (startAt.getTime() < now.getTime() - START_GRACE_MINUTES * 60 * 1000) {
    throw new PassError("START_IN_PAST");
  }
}
