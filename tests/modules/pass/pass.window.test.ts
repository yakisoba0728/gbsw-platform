import { describe, expect, it } from "vitest";
import { PassError } from "@/modules/pass/pass.error";
import { issueWindow, requestWindow } from "@/modules/pass/pass.window";

/** 2026-08-27 (목) 09:00 KST */
const NOW = new Date("2026-08-27T00:00:00.000Z");

function outing(over: Partial<Record<string, string>> = {}) {
  return {
    type: "OUTING" as const,
    date: "2026-08-27",
    startTime: "14:00",
    endTime: "18:00",
    destination: "치과",
    reason: "정기 검진",
    ...over,
  };
}

function overnight(over: Partial<Record<string, string>> = {}) {
  return {
    type: "OVERNIGHT" as const,
    startDate: "2026-08-28",
    endDate: "2026-08-29",
    destination: "본가",
    reason: "가족 행사",
    ...over,
  };
}

describe("requestWindow — 외출", () => {
  it("그날의 두 시각이 창이 된다", () => {
    const { startAt, endAt } = requestWindow(outing(), NOW);
    expect(startAt.toISOString()).toBe("2026-08-27T05:00:00.000Z"); // 14:00 KST
    expect(endAt.toISOString()).toBe("2026-08-27T09:00:00.000Z"); // 18:00 KST
  });

  it("끝이 시작보다 빠르면 INVALID_PERIOD", () => {
    expect(() => requestWindow(outing({ endTime: "13:00" }), NOW)).toThrow(
      new PassError("INVALID_PERIOD"),
    );
  });

  it("끝과 시작이 같아도 INVALID_PERIOD", () => {
    expect(() => requestWindow(outing({ endTime: "14:00" }), NOW)).toThrow(
      new PassError("INVALID_PERIOD"),
    );
  });

  it("지난 시각은 START_IN_PAST", () => {
    // NOW는 09:00 KST — 08:00 시작은 한 시간 전이다
    expect(() => requestWindow(outing({ startTime: "08:00" }), NOW)).toThrow(
      new PassError("START_IN_PAST"),
    );
  });

  it("10분 유예 안이면 통과한다 — 14:00을 적다가 14:01에 내는 일은 실수가 아니다", () => {
    const justAfter = new Date("2026-08-27T05:01:00.000Z"); // 14:01 KST
    expect(() => requestWindow(outing(), justAfter)).not.toThrow();
  });

  it("유예를 넘기면 막는다", () => {
    const wayAfter = new Date("2026-08-27T05:11:00.000Z"); // 14:11 KST
    expect(() => requestWindow(outing(), wayAfter)).toThrow(
      new PassError("START_IN_PAST"),
    );
  });
});

describe("requestWindow — 외박", () => {
  it("시작일 자정부터 종료일 다음 날 자정까지다", () => {
    const { startAt, endAt } = requestWindow(overnight(), NOW);
    expect(startAt.toISOString()).toBe("2026-08-27T15:00:00.000Z"); // 8/28 00:00 KST
    expect(endAt.toISOString()).toBe("2026-08-29T15:00:00.000Z"); // 8/30 00:00 KST
  });

  it("하루짜리 외박도 된다", () => {
    const { startAt, endAt } = requestWindow(
      overnight({ startDate: "2026-08-28", endDate: "2026-08-28" }),
      NOW,
    );
    expect(endAt.getTime() - startAt.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("종료일이 시작일보다 빠르면 INVALID_PERIOD", () => {
    expect(() =>
      requestWindow(overnight({ startDate: "2026-08-29", endDate: "2026-08-28" }), NOW),
    ).toThrow(new PassError("INVALID_PERIOD"));
  });

  it("7일까지는 되고 8일은 PERIOD_TOO_LONG", () => {
    expect(() =>
      requestWindow(overnight({ startDate: "2026-08-28", endDate: "2026-09-03" }), NOW),
    ).not.toThrow();
    expect(() =>
      requestWindow(overnight({ startDate: "2026-08-28", endDate: "2026-09-04" }), NOW),
    ).toThrow(new PassError("PERIOD_TOO_LONG"));
  });

  it("지난 날짜는 START_IN_PAST", () => {
    expect(() =>
      requestWindow(overnight({ startDate: "2026-08-26", endDate: "2026-08-27" }), NOW),
    ).toThrow(new PassError("START_IN_PAST"));
  });

  it("오늘 시작하는 외박은 된다 — 자정이 지났어도 그날은 아직 오늘이다", () => {
    expect(() =>
      requestWindow(overnight({ startDate: "2026-08-27", endDate: "2026-08-28" }), NOW),
    ).not.toThrow();
  });

  it("오늘 밤 외박을 저녁에 신청해도 된다 — 「지났다」를 날짜로 보기 때문이다", () => {
    const evening = new Date("2026-08-27T11:00:00.000Z"); // 20:00 KST
    expect(() =>
      requestWindow(
        overnight({ startDate: "2026-08-27", endDate: "2026-08-28" }),
        evening,
      ),
    ).not.toThrow();
  });
});

describe("issueWindow — 교사 직접 부여", () => {
  it("외출은 지금부터 그날 그 시각까지다", () => {
    const { startAt, endAt } = issueWindow(
      { type: "OUTING", studentId: "s-1", endTime: "18:00", destination: "치과", reason: "검진" },
      NOW,
    );
    expect(startAt).toEqual(NOW);
    expect(endAt.toISOString()).toBe("2026-08-27T09:00:00.000Z");
  });

  it("끝이 이미 지났으면 INVALID_PERIOD", () => {
    expect(() =>
      issueWindow(
        { type: "OUTING", studentId: "s-1", endTime: "08:00", destination: "치과", reason: "검진" },
        NOW,
      ),
    ).toThrow(new PassError("INVALID_PERIOD"));
  });

  it("외박은 지금부터 종료일 다음 날 자정까지다", () => {
    const { startAt, endAt } = issueWindow(
      {
        type: "OVERNIGHT",
        studentId: "s-1",
        endDate: "2026-08-29",
        destination: "본가",
        reason: "가족 행사",
        guardianConfirmed: "on",
        consentNote: "어머니와 전화 확인",
      },
      NOW,
    );
    expect(startAt).toEqual(NOW);
    expect(endAt.toISOString()).toBe("2026-08-29T15:00:00.000Z");
  });

  it("외박도 7일을 넘길 수 없다", () => {
    expect(() =>
      issueWindow(
        {
          type: "OVERNIGHT",
          studentId: "s-1",
          endDate: "2026-09-05",
          destination: "본가",
          reason: "가족 행사",
          guardianConfirmed: "on",
          consentNote: null,
        },
        NOW,
      ),
    ).toThrow(new PassError("PERIOD_TOO_LONG"));
  });
});
