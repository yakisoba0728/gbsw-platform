import type { PassType } from "@/core/authz/pass-type";

export const REQUEST_PERIOD_ERROR =
  "돌아오는 시각은 나가는 시각보다 늦어야 합니다.";

export function requestPeriodError(input: {
  type: PassType;
  date: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}): string | null {
  const startDate = input.type === "OUTING" ? input.date : input.startDate;
  const endDate = input.type === "OUTING" ? input.date : input.endDate;
  if (!startDate || !endDate || !input.startTime || !input.endTime) return null;

  return `${endDate}T${input.endTime}` <= `${startDate}T${input.startTime}`
    ? REQUEST_PERIOD_ERROR
    : null;
}
