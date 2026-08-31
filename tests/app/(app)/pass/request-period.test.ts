import { describe, expect, it } from "vitest";
import {
  REQUEST_PERIOD_ERROR,
  requestPeriodError,
} from "@/app/(app)/pass/new/request-period";

const base = {
  date: "2026-08-31",
  startDate: "2026-08-31",
  endDate: "2026-09-01",
  startTime: "18:00",
  endTime: "09:00",
};

describe("requestPeriodError", () => {
  it("외출은 같은 날 종료 시각이 시작 시각보다 늦어야 한다", () => {
    expect(requestPeriodError({ ...base, type: "OUTING" })).toBe(
      REQUEST_PERIOD_ERROR,
    );
    expect(
      requestPeriodError({
        ...base,
        type: "OUTING",
        startTime: "09:00",
        endTime: "18:00",
      }),
    ).toBeNull();
  });

  it("외박은 날짜와 시각을 합친 전체 기간을 비교한다", () => {
    expect(requestPeriodError({ ...base, type: "OVERNIGHT" })).toBeNull();
    expect(
      requestPeriodError({
        ...base,
        type: "OVERNIGHT",
        endDate: "2026-08-31",
      }),
    ).toBe(REQUEST_PERIOD_ERROR);
  });

  it("아직 덜 채운 칸은 네이티브 required 검증에 맡긴다", () => {
    expect(
      requestPeriodError({ ...base, type: "OVERNIGHT", endTime: "" }),
    ).toBeNull();
  });
});
