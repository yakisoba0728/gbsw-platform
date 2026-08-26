import { afterEach, describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateInput,
  formatDateTime,
  kstDayStart,
  kstHour,
  isSameKstDate,
  KST,
  parseDateInputKst,
  formatMonthDay,
  parseDateTimeInputKst,
  formatTimeInput,
  kstNextDayStart,
} from "@/lib/datetime";

/**
 * 날짜만 뜻이 있는 값(생년월일·발생일)이 저장되는 유일한 입구다.
 *
 * 여기가 어긋나도 화면에는 아무 이상이 안 보인다 — UTC 자정으로 저장해도 KST로
 * 표시하면 09:00으로 밀릴 뿐 날짜는 그대로다. 저장된 instant 자체가 9시간 다르고,
 * 그 차이는 이름+생년월일로 학생을 매칭하는 명단 반영에서 처음 터진다. 그때는
 * 이미 잘못된 값이 DB에 쌓인 뒤다.
 *
 * 그래서 이 파일은 "화면에 뭐가 보이나"가 아니라 **정확한 instant**를 못 박는다.
 */

/**
 * 개발자 노트북은 대개 TZ=Asia/Seoul이고 배포 컨테이너는 UTC다. UTC 기준으로
 * 자르는 구현은 노트북에서만 통과한다 — 아래 테스트들이 그 함정을 막는다.
 *
 * node는 process.env.TZ를 다시 대입하면 즉시 반영한다(v24 확인). 원복은 반드시
 * finally에서 한다 — 단언이 실패해도 다음 테스트에 새면 안 된다. 값이 원래
 * 없었다면 delete여야 한다(대입하면 "undefined"라는 **문자열**이 박힌다).
 */
const ORIGINAL_TZ = process.env.TZ;

function withTz<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  }
}

/** 대한민국(+09:00)을 사이에 끼고 양쪽으로 벌어진 타임존들. */
const OTHER_ZONES = ["UTC", "America/New_York", "Pacific/Kiritimati", "Asia/Seoul"];

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("KST 상수", () => {
  it("IANA 타임존 이름이다 — Intl에 그대로 넘긴다", () => {
    expect(KST).toBe("Asia/Seoul");
    expect(
      new Intl.DateTimeFormat("en-CA", { timeZone: KST }).resolvedOptions().timeZone,
    ).toBe("Asia/Seoul");
  });
});

describe("parseDateInputKst()", () => {
  it("KST 자정의 instant를 만든다 — UTC 자정이면 정확히 9시간 어긋난다", () => {
    expect(parseDateInputKst("2026-08-17").toISOString()).toBe("2026-08-16T15:00:00.000Z");
  });

  it("KST 자정은 전날 15:00Z다 — 날짜가 하루 앞으로 가는 것이 정상이다", () => {
    expect(parseDateInputKst("2026-01-01").toISOString()).toBe("2025-12-31T15:00:00.000Z");
    expect(parseDateInputKst("2026-03-01").toISOString()).toBe("2026-02-28T15:00:00.000Z");
    expect(parseDateInputKst("2028-02-29").toISOString()).toBe("2028-02-28T15:00:00.000Z");
  });

  it("한국은 서머타임이 없다 — 여름과 겨울이 같은 +09:00이다", () => {
    expect(parseDateInputKst("2026-07-15").toISOString()).toBe("2026-07-14T15:00:00.000Z");
    expect(parseDateInputKst("2026-12-15").toISOString()).toBe("2026-12-14T15:00:00.000Z");
  });

  it("서버 타임존이 무엇이든 같은 instant를 만든다", () => {
    const expected = "2026-08-16T15:00:00.000Z";
    for (const tz of OTHER_ZONES) {
      expect(withTz(tz, () => parseDateInputKst("2026-08-17").toISOString())).toBe(expected);
    }
  });
});

describe("formatDateInput()", () => {
  it("YYYY-MM-DD로 낸다", () => {
    expect(formatDateInput(new Date("2026-08-17T00:00:00+09:00"))).toBe("2026-08-17");
  });

  it("KST 늦은 밤은 UTC로 이미 다음 날이다 — 여기서 UTC로 자르면 하루가 밀린다", () => {
    // 20:00Z = KST 다음 날 05:00. UTC 기준 구현이면 "2026-08-17"이 나온다.
    expect(formatDateInput(new Date("2026-08-17T20:00:00.000Z"))).toBe("2026-08-18");
    // KST 23:59 = 같은 날. UTC로는 14:59Z라 이쪽은 UTC 구현도 맞힌다 — 대조군.
    expect(formatDateInput(new Date("2026-08-17T23:59:00+09:00"))).toBe("2026-08-17");
    // KST 00:00 = 전날 15:00Z. UTC 기준 구현이면 "2026-08-16"이 나온다.
    expect(formatDateInput(new Date("2026-08-17T00:00:00+09:00"))).toBe("2026-08-17");
  });

  it("월말·연말·윤년 경계에서도 KST 날짜를 낸다", () => {
    expect(formatDateInput(new Date("2026-12-31T15:30:00.000Z"))).toBe("2027-01-01");
    expect(formatDateInput(new Date("2026-01-31T16:00:00.000Z"))).toBe("2026-02-01");
    expect(formatDateInput(new Date("2028-02-28T15:00:00.000Z"))).toBe("2028-02-29");
    expect(formatDateInput(new Date("2028-02-29T15:00:00.000Z"))).toBe("2028-03-01");
  });

  it("두 자리로 채운다 — 문자열 비교와 <input type=\"date\">가 자릿수에 기댄다", () => {
    expect(formatDateInput(new Date("2026-01-02T00:00:00+09:00"))).toBe("2026-01-02");
    expect(formatDateInput(new Date("2026-01-02T00:00:00+09:00"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("서버 타임존이 무엇이든 KST 날짜를 낸다", () => {
    // 20:00Z는 뉴욕에서 아직 8/17, 키리바시에서는 이미 8/18이다. 셋 다 KST 답이어야 한다.
    const instant = new Date("2026-08-17T20:00:00.000Z");
    for (const tz of OTHER_ZONES) {
      expect(withTz(tz, () => formatDateInput(instant))).toBe("2026-08-18");
    }
  });
});

describe("formatDateInput() ↔ parseDateInputKst() 왕복", () => {
  const dates = [
    "1970-01-01",
    "2009-03-08", // 서머타임이 있는 나라라면 걸리는 날
    "2026-01-01",
    "2026-02-28",
    "2026-03-01",
    "2026-06-30",
    "2026-07-01",
    "2026-08-17",
    "2026-10-31",
    "2026-12-31",
    "2028-02-29", // 윤년
    "2100-12-31",
  ];

  it.each(dates)("%s는 KST 자정으로 갔다가 그대로 돌아온다", (value) => {
    expect(formatDateInput(parseDateInputKst(value))).toBe(value);
  });

  it("서버 타임존이 무엇이든 왕복이 깨지지 않는다", () => {
    for (const tz of OTHER_ZONES) {
      withTz(tz, () => {
        for (const value of dates) {
          expect(formatDateInput(parseDateInputKst(value))).toBe(value);
        }
      });
    }
  });

  it("KST 자정에서 1밀리초 모자라면 전날이다 — 경계가 자정에 정확히 걸려 있다", () => {
    const midnight = parseDateInputKst("2026-08-17");
    expect(formatDateInput(new Date(midnight.getTime() - 1))).toBe("2026-08-16");
    expect(formatDateInput(midnight)).toBe("2026-08-17");
  });
});

describe("isSameKstDate()", () => {
  it("UTC 날짜가 달라도 KST 날짜가 같으면 같은 날로 본다", () => {
    // 둘 다 KST 8/17. UTC로는 8/16과 8/17로 갈린다.
    const kstMorning = new Date("2026-08-17T01:00:00+09:00"); // 2026-08-16T16:00Z
    const kstEvening = new Date("2026-08-17T22:00:00+09:00"); // 2026-08-17T13:00Z
    expect(kstMorning.toISOString().slice(0, 10)).not.toBe(
      kstEvening.toISOString().slice(0, 10),
    );
    expect(isSameKstDate(kstMorning, kstEvening)).toBe(true);
  });

  it("UTC 날짜는 같은데 KST 날짜가 갈리면 다른 날로 본다", () => {
    const beforeMidnight = new Date("2026-08-17T14:00:00.000Z"); // KST 8/17 23:00
    const afterMidnight = new Date("2026-08-17T16:00:00.000Z"); // KST 8/18 01:00
    expect(isSameKstDate(beforeMidnight, afterMidnight)).toBe(false);
  });

  it("발생일(KST 자정)과 그날 아무 시각의 입력일을 같은 날로 본다", () => {
    const occurredOn = parseDateInputKst("2026-08-17");
    const createdAt = new Date("2026-08-17T17:42:11+09:00");
    expect(occurredOn.getTime()).not.toBe(createdAt.getTime());
    expect(isSameKstDate(occurredOn, createdAt)).toBe(true);
  });

  it("발생일이 하루라도 다르면 다르다 — 금요일 일을 월요일에 입력한 경우", () => {
    expect(
      isSameKstDate(parseDateInputKst("2026-08-14"), new Date("2026-08-17T09:00:00+09:00")),
    ).toBe(false);
  });

  it("순서를 바꿔도 같은 답이다", () => {
    const a = new Date("2026-08-17T00:30:00+09:00");
    const b = new Date("2026-08-17T23:30:00+09:00");
    expect(isSameKstDate(a, b)).toBe(isSameKstDate(b, a));
  });

  it("서버 타임존이 무엇이든 같은 답이다", () => {
    const a = new Date("2026-08-17T14:00:00.000Z"); // KST 8/17
    const b = new Date("2026-08-17T16:00:00.000Z"); // KST 8/18
    for (const tz of OTHER_ZONES) {
      expect(withTz(tz, () => isSameKstDate(a, b))).toBe(false);
      expect(withTz(tz, () => isSameKstDate(a, a))).toBe(true);
    }
  });
});

describe("formatDate() / formatDateTime()", () => {
  /**
   * 문구 자체는 ICU 버전에 달려 있다. 그래도 못 박는 이유는 소스의 주석이
   * 이 형식을 예시로 적고 있어서다 — 형식이 바뀌면 주석도 같이 고쳐야 한다.
   */
  it("소스 주석에 적힌 형식 그대로 낸다", () => {
    expect(formatDate(new Date("2026-08-17T00:00:00+09:00"))).toBe("2026. 8. 17.");
    expect(formatDateTime(new Date("2026-08-17T08:13:51+09:00"))).toBe(
      "26. 8. 17. 오전 8:13:51",
    );
  });

  it("KST로 읽는다 — UTC로 읽으면 날짜가 밀린다", () => {
    // KST 8/18 05:00. UTC로 읽으면 8/17로 나온다.
    expect(formatDate(new Date("2026-08-17T20:00:00.000Z"))).toBe("2026. 8. 18.");
  });

  it("서버 타임존이 무엇이든 KST로 낸다", () => {
    const instant = new Date("2026-08-17T20:00:00.000Z");
    for (const tz of OTHER_ZONES) {
      expect(withTz(tz, () => formatDate(instant))).toBe("2026. 8. 18.");
      expect(withTz(tz, () => formatDateTime(instant))).toBe("26. 8. 18. 오전 5:00:00");
    }
  });
});

describe("잘못된 입력에서의 현재 동작", () => {
  it.each([
    "",
    "2026-13-45",
    "없는날",
    "2026-8-1",
    " 2026-08-17",
    "2026-08",
    "2026",
    "2026-02-30",
    "2026-04-31",
  ])("정규형이 아니거나 실제 달력에 없는 날짜 %s를 거부한다", (value) => {
    expect(() => parseDateInputKst(value)).toThrow(RangeError);
  });

  it("Invalid Date를 포맷하면 던진다", () => {
    expect(() => parseDateInputKst("2026-13-45")).toThrow(RangeError);
    expect(() => formatDate(new Date(Number.NaN))).toThrow(RangeError);
    expect(() => isSameKstDate(new Date(Number.NaN), new Date())).toThrow(RangeError);
  });
});

describe("kstDayStart", () => {
  it("그 시각이 속한 KST 날짜의 자정으로 내린다", () => {
    expect(kstDayStart(new Date("2026-08-16T23:59:59+09:00"))).toEqual(
      new Date("2026-08-16T00:00:00+09:00"),
    );
    expect(kstDayStart(new Date("2026-08-16T00:00:00+09:00"))).toEqual(
      new Date("2026-08-16T00:00:00+09:00"),
    );
  });

  it("UTC가 아니라 KST 날짜다 — 여기가 어긋나면 창이 하루 밀린다", () => {
    // UTC로는 아직 8월 16일이지만 KST로는 17일이 시작됐다.
    expect(kstDayStart(new Date("2026-08-16T15:30:00Z"))).toEqual(
      new Date("2026-08-17T00:00:00+09:00"),
    );
  });
});

describe("kstHour", () => {
  it("KST 기준 시를 준다", () => {
    expect(kstHour(new Date("2026-08-18T00:10:00+09:00"))).toBe(0);
    expect(kstHour(new Date("2026-08-18T23:59:00+09:00"))).toBe(23);
  });

  it("UTC 자정이 KST 오전 9시다 — 서버 시간대를 따라가면 안 된다", () => {
    expect(kstHour(new Date("2026-08-18T00:00:00Z"))).toBe(9);
  });
});

describe("formatMonthDay()", () => {
  it("연도를 빼고 월·일만 적는다 — 이레짜리 범위는 두 끝이 같은 해다", () => {
    expect(formatMonthDay(new Date("2026-08-26T00:00:00+09:00"))).toBe("8. 26.");
    expect(formatMonthDay(new Date("2026-08-20T00:00:00+09:00"))).toBe("8. 20.");
  });

  it("KST 기준이다 — UTC로 자르면 하루 밀린다", () => {
    // UTC로는 8월 25일 15:10이지만 KST로는 26일 00:10이다.
    expect(formatMonthDay(new Date("2026-08-25T15:10:00Z"))).toBe("8. 26.");
  });
});

describe("parseDateTimeInputKst", () => {
  it("KST 시각으로 읽는다", () => {
    // 2026-08-27 14:30 KST = 05:30 UTC
    expect(parseDateTimeInputKst("2026-08-27", "14:30").toISOString()).toBe(
      "2026-08-27T05:30:00.000Z",
    );
  });

  it("자정과 23:59를 다룬다", () => {
    expect(parseDateTimeInputKst("2026-08-27", "00:00").toISOString()).toBe(
      "2026-08-26T15:00:00.000Z",
    );
    expect(parseDateTimeInputKst("2026-08-27", "23:59").toISOString()).toBe(
      "2026-08-27T14:59:00.000Z",
    );
  });

  it("형식이 아니면 던진다 — 조용히 엉뚱한 시각이 되면 안 된다", () => {
    expect(() => parseDateTimeInputKst("2026-8-27", "14:30")).toThrow(RangeError);
    expect(() => parseDateTimeInputKst("2026-08-27", "24:00")).toThrow(RangeError);
    expect(() => parseDateTimeInputKst("2026-08-27", "14:60")).toThrow(RangeError);
    expect(() => parseDateTimeInputKst("2026-08-27", "1430")).toThrow(RangeError);
  });
});

describe("formatTimeInput", () => {
  it("KST 24시간 표기로 낸다", () => {
    expect(formatTimeInput(new Date("2026-08-27T05:30:00.000Z"))).toBe("14:30");
  });

  it("자정은 24:00이 아니라 00:00이다", () => {
    expect(formatTimeInput(new Date("2026-08-26T15:00:00.000Z"))).toBe("00:00");
  });

  it("parseDateTimeInputKst와 왕복한다", () => {
    for (const time of ["00:00", "07:05", "12:00", "18:45", "23:59"]) {
      expect(formatTimeInput(parseDateTimeInputKst("2026-08-27", time))).toBe(time);
    }
  });
});

describe("kstNextDayStart", () => {
  it("그 KST 날짜의 다음 날 자정이다", () => {
    expect(kstNextDayStart("2026-08-27").toISOString()).toBe("2026-08-27T15:00:00.000Z");
  });

  it("월말을 넘긴다", () => {
    expect(kstNextDayStart("2026-08-31").toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(formatDateInput(kstNextDayStart("2026-08-31"))).toBe("2026-09-01");
  });
});
