import { describe, expect, it } from "vitest";
import {
  approvePassSchema,
  cancelPassSchema,
  issuePassSchema,
  rejectPassSchema,
  requestPassSchema,
} from "@/modules/pass/pass.schema";

describe("requestPassSchema", () => {
  it("외출은 날짜 하나와 시각 둘을 받는다", () => {
    const parsed = requestPassSchema.safeParse({
      type: "OUTING",
      date: "2026-08-27",
      startTime: "14:00",
      endTime: "18:00",
      destination: "  치과  ",
      reason: "정기 검진",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "OUTING") {
      expect(parsed.data.destination).toBe("치과"); // 앞뒤 공백은 다듬는다
    }
  });

  it("외박은 날짜 둘을 받고 시각 칸이 없다", () => {
    const parsed = requestPassSchema.safeParse({
      type: "OVERNIGHT",
      startDate: "2026-08-28",
      endDate: "2026-08-29",
      destination: "본가",
      reason: "가족 행사",
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["날짜 형식", { type: "OUTING", date: "2026-8-27", startTime: "14:00", endTime: "18:00", destination: "치과", reason: "검진" }],
    ["24시", { type: "OUTING", date: "2026-08-27", startTime: "24:00", endTime: "18:00", destination: "치과", reason: "검진" }],
    ["빈 행선지", { type: "OUTING", date: "2026-08-27", startTime: "14:00", endTime: "18:00", destination: "   ", reason: "검진" }],
    ["모르는 유형", { type: "LEAVE", date: "2026-08-27" }],
  ])("%s는 거부한다", (_label, input) => {
    expect(requestPassSchema.safeParse(input).success).toBe(false);
  });

  it("사유 200자 초과는 자르지 않고 거부한다", () => {
    const parsed = requestPassSchema.safeParse({
      type: "OVERNIGHT",
      startDate: "2026-08-28",
      endDate: "2026-08-29",
      destination: "본가",
      reason: "가".repeat(201),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("issuePassSchema", () => {
  it("외박은 보호자 확인 체크가 필수다", () => {
    const base = {
      type: "OVERNIGHT",
      studentId: "s-1",
      endDate: "2026-08-29",
      destination: "본가",
      reason: "가족 행사",
    };
    expect(issuePassSchema.safeParse(base).success).toBe(false);
    expect(
      issuePassSchema.safeParse({ ...base, guardianConfirmed: "on" }).success,
    ).toBe(true);
  });

  it("외출에는 보호자 확인 칸이 없다", () => {
    const parsed = issuePassSchema.safeParse({
      type: "OUTING",
      studentId: "s-1",
      endTime: "18:00",
      destination: "치과",
      reason: "검진",
    });
    expect(parsed.success).toBe(true);
  });

  it("시작 시각을 받지 않는다 — 넘겨도 무시한다", () => {
    const parsed = issuePassSchema.safeParse({
      type: "OUTING",
      studentId: "s-1",
      startTime: "01:00",
      endTime: "18:00",
      destination: "치과",
      reason: "검진",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "startTime" in parsed.data).toBe(false);
  });
});

describe("approve/reject/cancel", () => {
  it("반려 사유는 필수다", () => {
    expect(rejectPassSchema.safeParse({ passId: "p-1", decisionNote: "" }).success).toBe(false);
    expect(rejectPassSchema.safeParse({ passId: "p-1", decisionNote: "기간이 너무 깁니다" }).success).toBe(true);
  });

  it("취소 사유는 선택이고 빈 값은 null이 된다", () => {
    const parsed = cancelPassSchema.safeParse({ passId: "p-1", reason: "" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.reason).toBeNull();
  });

  it("승인의 보호자 확인 대행은 선택이다", () => {
    expect(approvePassSchema.safeParse({ passId: "p-1" }).success).toBe(true);
    expect(
      approvePassSchema.safeParse({ passId: "p-1", byProxy: "on", consentNote: "전화 확인" })
        .success,
    ).toBe(true);
  });
});
