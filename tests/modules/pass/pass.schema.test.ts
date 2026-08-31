import { describe, expect, it } from "vitest";
import { formatDateInput } from "@/lib/datetime";
import {
  approvePassSchema,
  cancelPassSchema,
  issuePassSchema,
  passHistoryExportSchema,
  passHistoryQuerySchema,
  passHistoryRange,
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

  it("외박은 날짜와 시각을 둘씩 받는다", () => {
    const parsed = requestPassSchema.safeParse({
      type: "OVERNIGHT",
      startDate: "2026-08-28",
      startTime: "18:00",
      endDate: "2026-08-29",
      endTime: "21:00",
      destination: "본가",
      reason: "가족 행사",
    });
    expect(parsed.success).toBe(true);
  });

  /** 날짜만 오던 시절의 폼이 남아 있으면 조용히 자정으로 굳는다 — 막는다. */
  it("외박에 시각이 빠지면 거부한다", () => {
    expect(
      requestPassSchema.safeParse({
        type: "OVERNIGHT",
        startDate: "2026-08-28",
        endDate: "2026-08-29",
        destination: "본가",
        reason: "가족 행사",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["날짜 형식", { type: "OUTING", date: "2026-8-27", startTime: "14:00", endTime: "18:00", destination: "치과", reason: "검진" }],
    ["24시", { type: "OUTING", date: "2026-08-27", startTime: "24:00", endTime: "18:00", destination: "치과", reason: "검진" }],
    ["빈 행선지", { type: "OUTING", date: "2026-08-27", startTime: "14:00", endTime: "18:00", destination: "   ", reason: "검진" }],
    ["모르는 유형", { type: "LEAVE", date: "2026-08-27" }],
    ["외박의 24시", { type: "OVERNIGHT", startDate: "2026-08-28", startTime: "24:00", endDate: "2026-08-29", endTime: "21:00", destination: "본가", reason: "가족 행사" }],
  ])("%s는 거부한다", (_label, input) => {
    expect(requestPassSchema.safeParse(input).success).toBe(false);
  });

  it("사유 200자 초과는 자르지 않고 거부한다", () => {
    const parsed = requestPassSchema.safeParse({
      type: "OVERNIGHT",
      startDate: "2026-08-28",
      startTime: "18:00",
      endDate: "2026-08-29",
      endTime: "21:00",
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
      endTime: "21:00",
      destination: "본가",
      reason: "가족 행사",
    };
    expect(issuePassSchema.safeParse(base).success).toBe(false);
    expect(
      issuePassSchema.safeParse({ ...base, guardianConfirmed: "on" }).success,
    ).toBe(true);
  });

  /** 부여도 시작은 「지금」이지만 **종료는 시각까지 받는다.** */
  it("외박의 종료 시각이 빠지면 거부한다", () => {
    expect(
      issuePassSchema.safeParse({
        type: "OVERNIGHT",
        studentId: "s-1",
        endDate: "2026-08-29",
        destination: "본가",
        reason: "가족 행사",
        guardianConfirmed: "on",
      }).success,
    ).toBe(false);
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

  it("외박도 시작을 받지 않는다 — 「지금 내보낸다」다", () => {
    const parsed = issuePassSchema.safeParse({
      type: "OVERNIGHT",
      studentId: "s-1",
      startDate: "2026-08-28",
      startTime: "01:00",
      endDate: "2026-08-29",
      endTime: "21:00",
      destination: "본가",
      reason: "가족 행사",
      guardianConfirmed: "on",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "startDate" in parsed.data).toBe(false);
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
    const normal = approvePassSchema.parse({
      passId: "p-1",
      decisionNote: "  병원 예약 확인  ",
    });
    expect(normal).toMatchObject({
      decisionNote: "병원 예약 확인",
      consentNote: null,
    });

    const proxy = approvePassSchema.parse({
      passId: "p-1",
      byProxy: "on",
      consentNote: "전화 확인",
    });
    expect(proxy).toMatchObject({
      byProxy: "on",
      decisionNote: null,
      consentNote: "전화 확인",
    });
  });
});

describe("passHistoryQuerySchema", () => {
  it("아무것도 안 주면 1쪽에 조건 없음이다", () => {
    const parsed = passHistoryQuerySchema.parse({});
    expect(parsed).toEqual({
      type: undefined,
      status: undefined,
      q: undefined,
      from: undefined,
      to: undefined,
      page: 1,
    });
  });

  it("빈 문자열은 「안 고름」이다 — 빈 값과 갈리지 않는다", () => {
    const parsed = passHistoryQuerySchema.parse({ q: "   ", from: "", to: "" });
    expect(parsed.q).toBeUndefined();
    expect(parsed.from).toBeUndefined();
    expect(parsed.to).toBeUndefined();
  });

  it.each([
    ["자릿수가 모자란 날짜", { from: "2026-8-2" }],
    ["없는 날짜", { from: "2026-02-30" }],
    ["끝 날짜도 같은 잣대", { to: "2026-13-01" }],
    ["0쪽", { page: "0" }],
    ["1000쪽 초과", { page: "1001" }],
    ["숫자가 아닌 쪽", { page: "둘" }],
    ["모르는 유형", { type: "LEAVE" }],
    ["모르는 상태", { status: "EXPIRED" }],
    ["61자 검색어", { q: "가".repeat(61) }],
  ])("%s는 거부한다 — 화면은 기본 조건으로 되돌린다", (_label, input) => {
    expect(passHistoryQuerySchema.safeParse(input).success).toBe(false);
  });

  it("쪽 번호는 문자열로 와도 수가 된다", () => {
    expect(passHistoryQuerySchema.parse({ page: "3" }).page).toBe(3);
  });

  it("시작일이 종료일보다 늦으면 화면 조회와 내보내기 모두 거부한다", () => {
    const reversed = { from: "2026-08-27", to: "2026-08-26" };
    const query = passHistoryQuerySchema.safeParse(reversed);
    const exported = passHistoryExportSchema.safeParse(reversed);

    expect(query.success).toBe(false);
    expect(exported.success).toBe(false);
    if (!query.success) {
      expect(query.error.issues[0]).toMatchObject({
        path: ["to"],
        message: "시작일은 종료일보다 늦을 수 없습니다.",
      });
    }
  });

  it("시작일과 종료일이 같으면 그 하루를 조회할 수 있다", () => {
    expect(
      passHistoryQuerySchema.safeParse({
        from: "2026-08-26",
        to: "2026-08-26",
      }).success,
    ).toBe(true);
  });

  it("내보내기 조건에는 쪽 번호가 없다", () => {
    const parsed = passHistoryExportSchema.parse({ page: "5", type: "OUTING" });
    expect("page" in parsed).toBe(false);
    expect(parsed.type).toBe("OUTING");
  });
});

describe("passHistoryRange", () => {
  /** 2026-08-26 09:00 KST. 서버가 UTC로 돌아도 눈금은 KST 자정이어야 한다. */
  const NOW = new Date("2026-08-26T00:00:00.000Z");

  it("기간을 비우면 오늘을 포함한 최근 30일이다", () => {
    const { since, until } = passHistoryRange({}, NOW);

    expect(formatDateInput(since)).toBe("2026-07-28"); // 7/28 ~ 8/26 = 30일
    expect(since.toISOString()).toBe("2026-07-27T15:00:00.000Z"); // KST 자정
    // 상한이 없다 — 다음 주 외박 신청도 「전체 내역」에 들어 있어야 한다.
    expect(until).toBeNull();
  });

  it("KST로 날이 바뀐 뒤에는 새 날을 기준으로 센다", () => {
    // 2026-08-26 20:00 UTC = 8/27 05:00 KST. UTC로 자르면 하루 밀린다.
    const { since } = passHistoryRange({}, new Date("2026-08-26T20:00:00.000Z"));
    expect(formatDateInput(since)).toBe("2026-07-29");
  });

  it("시작을 고르면 그날 KST 자정부터다", () => {
    const { since } = passHistoryRange({ from: "2026-03-02" }, NOW);
    expect(since.toISOString()).toBe("2026-03-01T15:00:00.000Z");
  });

  it("끝을 고르면 그날을 통째로 포함한다 — 다음 날 자정 미만", () => {
    const { until } = passHistoryRange({ to: "2026-08-20" }, NOW);
    expect(until?.toISOString()).toBe("2026-08-20T15:00:00.000Z"); // 8/21 00:00 KST
  });
});
