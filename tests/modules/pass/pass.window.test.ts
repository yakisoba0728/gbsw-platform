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
  /**
   * **적은 시각이 그대로 창이 된다.** 예전에는 시작일 자정 ~ 종료일 다음 날 자정
   * 이라 화면과 시트가 하루를 되돌려 그려야 했다 — 그 보정이 사라진 자리를
   * 이 검사가 지킨다.
   */
  it("적은 두 시각이 그대로 창이 된다 — 자정으로 끌려가지 않는다", () => {
    const { startAt, endAt } = requestWindow(overnight(), NOW);
    expect(startAt.toISOString()).toBe("2026-08-28T09:00:00.000Z"); // 8/28 18:00 KST
    expect(endAt.toISOString()).toBe("2026-08-29T12:00:00.000Z"); // 8/29 21:00 KST
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

  /** 168시간이 경계다. 자정~자정이 아니게 된 뒤로는 일수가 아니라 시간으로 센다. */
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

  /**
   * **시각이 생기면서 「지났다」의 눈금이 외출과 같아졌다.** 예전에는 외박만
   * 날짜로 봤다 — 시작이 자정이라 오전에 신청하면 이미 지난 것이 됐기 때문이다.
   * 이제는 학생이 나가는 시각을 직접 적으므로 그 예외가 필요 없다.
   */
  it("오늘 밤 외박을 낮에 신청하는 것은 지난 것이 아니다", () => {
    expect(() =>
      requestWindow(
        overnight({ startDate: "2026-08-27", startTime: "18:00", endDate: "2026-08-28" }),
        NOW, // 09:00 KST
      ),
    ).not.toThrow();
  });

  it("오늘이어도 시각이 지났으면 START_IN_PAST", () => {
    const evening = new Date("2026-08-27T11:00:00.000Z"); // 20:00 KST
    expect(() =>
      requestWindow(
        overnight({ startDate: "2026-08-27", startTime: "18:00", endDate: "2026-08-28" }),
        evening,
      ),
    ).toThrow(new PassError("START_IN_PAST"));
  });

  it("외박도 10분 유예를 받는다 — 외출과 같은 눈금이다", () => {
    const justAfter = new Date("2026-08-27T09:05:00.000Z"); // 18:05 KST
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
    expect(endAt.toISOString()).toBe("2026-08-29T12:00:00.000Z"); // 8/29 21:00 KST
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

    // NOW는 8/27 09:00 KST — 9/3 09:00까지가 딱 이레다.
    expect(() => issueWindow(input("2026-09-03", "09:00"), NOW)).not.toThrow();
    expect(() => issueWindow(input("2026-09-03", "09:01"), NOW)).toThrow(
      new PassError("PERIOD_TOO_LONG"),
    );
  });
});
