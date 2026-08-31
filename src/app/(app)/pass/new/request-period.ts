import type { PassType } from "@/core/authz/pass-type";

export const REQUEST_PERIOD_ERROR =
  "돌아오는 시각은 나가는 시각보다 늦어야 합니다.";

/**
 * 달력·시각 입력이 모두 찼을 때 순서를 바로 알려 준다. canonical 입력끼리는
 * `YYYY-MM-DDTHH:mm` 문자열 순서가 곧 시각 순서다. 빈 칸은 네이티브 required가
 * 맡으므로 여기서는 오류로 만들지 않는다.
 */
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
