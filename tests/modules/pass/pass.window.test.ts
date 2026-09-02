import { describe, expect, it } from "vitest";
import { PassError } from "@/modules/pass/pass.error";
import {
  conflictWindow,
  issueWindow,
  requestWindow,
} from "@/modules/pass/pass.window";

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
    startTime: "18:00",
    endDate: "2026-08-29",
    endTime: "21:00",
    destination: "본가",
    reason: "가족 행사",
    ...over,
  };
}

describe("requestWindow — 외출", () => {
  it("그날의 두 시각이 창이 된다", () => {
    const { startAt, endAt } = requestWindow(outing(), NOW);
    expect(startAt.toISOString()).toBe("2026-08-27T05:00:00.000Z");
    expect(endAt.toISOString()).toBe("2026-08-27T09:00:00.000Z");
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
    expect(() => requestWindow(outing({ startTime: "08:00" }), NOW)).toThrow(
      new PassError("START_IN_PAST"),
    );
  });

  it("10분 유예 안이면 통과한다 — 14:00을 적다가 14:01에 내는 일은 실수가 아니다", () => {
    const justAfter = new Date("2026-08-27T05:01:00.000Z");
    expect(() => requestWindow(outing(), justAfter)).not.toThrow();
  });

  it("유예를 넘기면 막는다", () => {
    const wayAfter = new Date("2026-08-27T05:11:00.000Z");
    expect(() => requestWindow(outing(), wayAfter)).toThrow(
      new PassError("START_IN_PAST"),
    );
  });
});

describe("requestWindow — 외박", () => {
  it("적은 두 시각이 그대로 창이 된다 — 자정으로 끌려가지 않는다", () => {
    const { startAt, endAt } = requestWindow(overnight(), NOW);
    expect(startAt.toISOString()).toBe("2026-08-28T09:00:00.000Z");
    expect(endAt.toISOString()).toBe("2026-08-29T12:00:00.000Z");
  });

  it("하룻밤이면 딱 그만큼이다", () => {
    const { startAt, endAt } = requestWindow(
      overnight({
        startDate: "2026-08-28",
        startTime: "18:00",
        endDate: "2026-08-29",
        endTime: "18:00",
      }),
      NOW,
    );
    expect(endAt.getTime() - startAt.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("종료일이 시작일보다 빠르면 INVALID_PERIOD", () => {
    expect(() =>
      requestWindow(overnight({ startDate: "2026-08-29", endDate: "2026-08-28" }), NOW),
    ).toThrow(new PassError("INVALID_PERIOD"));
  });

  it("같은 날 안이어도 순서만 맞으면 창이 선다 — 날을 넘길 것을 강요하지 않는다", () => {
    const { startAt, endAt } = requestWindow(
      overnight({ startDate: "2026-08-28", endDate: "2026-08-28", endTime: "22:00" }),
      NOW,
    );
    expect(endAt.getTime() - startAt.getTime()).toBe(4 * 60 * 60 * 1000);
  });

  it("정확히 7일은 되고 1분만 넘어도 PERIOD_TOO_LONG", () => {
    expect(() =>
      requestWindow(
        overnight({
          startDate: "2026-08-28",
          startTime: "18:00",
          endDate: "2026-09-04",
          endTime: "18:00",
        }),
        NOW,
      ),
    ).not.toThrow();

    expect(() =>
      requestWindow(
        overnight({
          startDate: "2026-08-28",
          startTime: "18:00",
          endDate: "2026-09-04",
          endTime: "18:01",
        }),
        NOW,
      ),
    ).toThrow(new PassError("PERIOD_TOO_LONG"));
  });

  it("지난 날짜는 START_IN_PAST", () => {
    expect(() =>
      requestWindow(overnight({ startDate: "2026-08-26", endDate: "2026-08-27" }), NOW),
    ).toThrow(new PassError("START_IN_PAST"));
  });

  it("오늘 밤 외박을 낮에 신청하는 것은 지난 것이 아니다", () => {
    expect(() =>
      requestWindow(
        overnight({ startDate: "2026-08-27", startTime: "18:00", endDate: "2026-08-28" }),
        NOW,
      ),
    ).not.toThrow();
  });

  it("오늘이어도 시각이 지났으면 START_IN_PAST", () => {
    const evening = new Date("2026-08-27T11:00:00.000Z");
    expect(() =>
      requestWindow(
        overnight({ startDate: "2026-08-27", startTime: "18:00", endDate: "2026-08-28" }),
        evening,
      ),
    ).toThrow(new PassError("START_IN_PAST"));
  });

  it("외박도 10분 유예를 받는다 — 외출과 같은 눈금이다", () => {
    const justAfter = new Date("2026-08-27T09:05:00.000Z");
    expect(() =>
      requestWindow(
        overnight({ startDate: "2026-08-27", startTime: "18:00", endDate: "2026-08-28" }),
        justAfter,
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

  it("KST로 날짜가 바뀐 뒤에는 새 날짜의 종료 시각을 쓴다", () => {
    const afterKstMidnight = new Date("2026-08-27T16:00:00.000Z");
    const { endAt } = issueWindow(
      {
        type: "OUTING",
        studentId: "s-1",
        endTime: "18:00",
        destination: "치과",
        reason: "검진",
      },
      afterKstMidnight,
    );

    expect(endAt.toISOString()).toBe("2026-08-28T09:00:00.000Z");
  });

  it("끝이 이미 지났으면 INVALID_PERIOD", () => {
    expect(() =>
      issueWindow(
        { type: "OUTING", studentId: "s-1", endTime: "08:00", destination: "치과", reason: "검진" },
        NOW,
      ),
    ).toThrow(new PassError("INVALID_PERIOD"));
  });

  it("외박은 지금부터 적은 날짜의 적은 시각까지다 — 자정이 아니다", () => {
    const { startAt, endAt } = issueWindow(
      {
        type: "OVERNIGHT",
        studentId: "s-1",
        endDate: "2026-08-29",
        endTime: "21:00",
        destination: "본가",
        reason: "가족 행사",
        guardianConfirmed: "on",
        consentNote: "어머니와 전화 확인",
      },
      NOW,
    );
    expect(startAt).toEqual(NOW);
    expect(endAt.toISOString()).toBe("2026-08-29T12:00:00.000Z");
  });

  it("외박도 168시간을 넘길 수 없다", () => {
    const input = (endDate: string, endTime: string) =>
      ({
        type: "OVERNIGHT",
        studentId: "s-1",
        endDate,
        endTime,
        destination: "본가",
        reason: "가족 행사",
        guardianConfirmed: "on",
        consentNote: null,
      }) as const;

    expect(() => issueWindow(input("2026-09-03", "09:00"), NOW)).not.toThrow();
    expect(() => issueWindow(input("2026-09-03", "09:01"), NOW)).toThrow(
      new PassError("PERIOD_TOO_LONG"),
    );
  });
});

describe("conflictWindow — 연속 부재 방지 여백", () => {
  it("유효 창의 앞뒤를 각각 60분 넓힌다", () => {
    const result = conflictWindow({
      startAt: new Date("2026-08-27T05:00:00.000Z"),
      endAt: new Date("2026-08-27T09:00:00.000Z"),
    });

    expect(result.startAt.toISOString()).toBe("2026-08-27T04:00:00.000Z");
    expect(result.endAt.toISOString()).toBe("2026-08-27T10:00:00.000Z");
  });
});
