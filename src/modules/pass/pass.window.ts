import { formatDateInput, parseDateTimeInputKst } from "@/lib/datetime";
import { PassError } from "./pass.error";
import type { IssuePassInput, RequestPassInput } from "./pass.schema";

export const MAX_OVERNIGHT_DAYS = 7;

const CHAIN_GAP_MINUTES = 60;

const START_GRACE_MINUTES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export function requestWindow(
  input: RequestPassInput,
  now: Date,
): { startAt: Date; endAt: Date } {
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
  const endDate = input.type === "OUTING" ? formatDateInput(now) : input.endDate;

  const window = { startAt: now, endAt: parseDateTimeInputKst(endDate, input.endTime) };
  assertOrdered(window);
  assertNotTooLong(input.type, window);
  return window;
}

export function conflictWindow({
  startAt,
  endAt,
}: {
  startAt: Date;
  endAt: Date;
}): { startAt: Date; endAt: Date } {
  const gap = CHAIN_GAP_MINUTES * 60 * 1000;
  return {
    startAt: new Date(startAt.getTime() - gap),
    endAt: new Date(endAt.getTime() + gap),
  };
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

function assertNotStarted({ startAt }: { startAt: Date }, now: Date): void {
  if (startAt.getTime() < now.getTime() - START_GRACE_MINUTES * 60 * 1000) {
    throw new PassError("START_IN_PAST");
  }
}
