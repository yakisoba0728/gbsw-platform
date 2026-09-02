import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type * as DateTime from "@/lib/datetime";

type DateTimeModule = typeof DateTime;

/**
 * 「화면에 보이는 시각은 전부 KST다」를 **서버 시간대와 무관하게** 못 박는다.
 *
 * `datetime.test.ts`가 값 하나하나의 뜻을 지킨다면, 이 파일이 지키는 것은
 * 그보다 앞의 규약이다 — `src/lib/datetime.ts`의 **모든 export**가 프로세스
 * 시간대를 따라가지 않는다. 개발 노트북은 대개 TZ=Asia/Seoul이고 배포 컨테이너는
 * UTC라, 시간대를 빠뜨린 포맷터는 노트북에서만 통과하고 운영에서 하루씩 밀린다.
 *
 * **모듈을 매번 다시 임포트하는 것이 이 파일의 핵심이다.** `Intl.DateTimeFormat`은
 * 모듈 최상위에서 한 번 만들어지고, `timeZone`을 주지 않은 포맷터는 **만들어진
 * 순간의** 프로세스 시간대를 물고 그대로 굳는다. 한 번 임포트한 모듈을 재사용하면
 * TZ를 바꿔도 그 포맷터는 꿈쩍하지 않아, 정작 잡아야 할 실수가 전부 통과한다.
 * 그래서 `vi.resetModules()` + 동적 import다.
 *
 * **기대값을 하드코딩하는 것도 일부러다.** 네 시간대의 결과가 서로 같은지만 보면
 * 「Asia/Tokyo를 박아 둔」 포맷터도, 「America/New_York을 박아 둔」 포맷터도 통과한다
 * (고정이긴 하니까). 시간대와 무관한지와 **그 고정값이 KST인지**는 다른 질문이다.
 */

/** 대한민국(+09:00)을 사이에 끼고 양쪽으로 벌어진 시간대들. */
const ZONES = ["UTC", "America/New_York", "Asia/Seoul", "Pacific/Kiritimati"] as const;

/**
 * KST 자정 직전·직후. 하루가 갈리는 이 두 순간이 이 파일 전체의 시금석이다.
 *
 * - UTC로 읽으면 둘 다 8월 17일 오후다 — 날짜가 하루 뒤진다.
 * - New York(-04:00)으로 읽으면 둘 다 8월 17일 오전이다.
 * - Kiritimati(+14:00)로 읽으면 둘 다 8월 18일이다 — 앞의 것이 하루 앞선다.
 *
 * KST로만 「8월 17일 23:59:59.999 → 8월 18일 00:00:00.000」으로 갈린다.
 */
const BEFORE_MIDNIGHT = new Date("2026-08-17T14:59:59.999Z");
const AFTER_MIDNIGHT = new Date("2026-08-17T15:00:00.000Z");

/**
 * export 하나를 두 경계 순간에서 돌려 한 줄로 만든다.
 *
 * `name`은 `src/lib/datetime.ts`의 export 이름 그대로여야 한다 — 아래
 * 「모든 export를 덮는다」가 이 이름들을 실제 export 목록과 맞춰 보고,
 * 새 export가 표에 빠지면 그 자리에서 깨진다.
 */
type Probe = {
  name: keyof DateTimeModule;
  /** `자정 직전 | 자정 직후` 형태. 시간대가 무엇이든 이 값이어야 한다. */
  expected: string;
  run: (m: DateTimeModule) => string;
};

/** 두 경계 순간에 같은 함수를 적용해 `a | b`로 잇는다. */
function bothSides(
  format: (value: Date) => string | number,
): string {
  return `${format(BEFORE_MIDNIGHT)} | ${format(AFTER_MIDNIGHT)}`;
}

const PROBES: Probe[] = [
  {
    name: "KST",
    expected: "Asia/Seoul",
    run: (m) => m.KST,
  },
  {
    name: "formatDate",
    expected: "2026. 8. 17. | 2026. 8. 18.",
    run: (m) => bothSides(m.formatDate),
  },
  {
    name: "formatDateTime",
    expected: "26. 8. 17. 오후 11:59:59 | 26. 8. 18. 오전 12:00:00",
    run: (m) => bothSides(m.formatDateTime),
  },
  {
    name: "formatDateTimeShort",
    expected: "26. 8. 17. 오후 11:59 | 26. 8. 18. 오전 12:00",
    run: (m) => bothSides(m.formatDateTimeShort),
  },
  {
    name: "formatTimeShort",
    expected: "오후 11:59 | 오전 12:00",
    run: (m) => bothSides(m.formatTimeShort),
  },
  {
    // 상단바 시계. 시 자리가 두 자리로 고정돼 있다 (폭이 흔들리면 옆이 밀린다).
    name: "formatClock",
    expected: "오후 11:59:59 | 오전 12:00:00",
    run: (m) => bothSides(m.formatClock),
  },
  {
    name: "formatMonthDayTime",
    expected: "8. 17. 오후 11:59 | 8. 18. 오전 12:00",
    run: (m) => bothSides(m.formatMonthDayTime),
  },
  {
    name: "formatMonthDay",
    expected: "8. 17. | 8. 18.",
    run: (m) => bothSides(m.formatMonthDay),
  },
  {
    name: "formatDateTimeSheet",
    expected: "2026-08-17 23:59:59 | 2026-08-18 00:00:00",
    run: (m) => bothSides(m.formatDateTimeSheet),
  },
  {
    // 생년월일이 이 함수로 잘린다. 여기가 밀리면 명단 반영이 엉뚱한 학생을 찾는다.
    name: "formatDateInput",
    expected: "2026-08-17 | 2026-08-18",
    run: (m) => bothSides(m.formatDateInput),
  },
  {
    // 그 순간이 속한 KST 날짜의 자정. 통계 창의 왼쪽 끝이다.
    name: "kstDayStart",
    expected: "2026-08-16T15:00:00.000Z | 2026-08-17T15:00:00.000Z",
    run: (m) => bothSides((value) => m.kstDayStart(value).toISOString()),
  },
  {
    // 자정을 사이에 두면 다른 날, 같은 순간끼리는 같은 날.
    name: "isSameKstDate",
    expected: "false | true",
    run: (m) =>
      `${m.isSameKstDate(BEFORE_MIDNIGHT, AFTER_MIDNIGHT)} | ${m.isSameKstDate(
        AFTER_MIDNIGHT,
        AFTER_MIDNIGHT,
      )}`,
  },
  {
    // 입력이 문자열이라 두 경계 날짜를 직접 넣는다.
    name: "parseDateInputKst",
    expected: "2026-08-16T15:00:00.000Z | 2026-08-17T15:00:00.000Z",
    run: (m) =>
      `${m.parseDateInputKst("2026-08-17").toISOString()} | ${m
        .parseDateInputKst("2026-08-18")
        .toISOString()}`,
  },
  {
    name: "parseDateTimeInputKst",
    expected: "2026-08-17T14:59:00.000Z | 2026-08-17T15:00:00.000Z",
    run: (m) =>
      `${m.parseDateTimeInputKst("2026-08-17", "23:59").toISOString()} | ${m
        .parseDateTimeInputKst("2026-08-18", "00:00")
        .toISOString()}`,
  },
  {
    // 8/17의 끝 = 8/18 자정. 외박 endAt이 이 눈금이다.
    name: "kstNextDayStart",
    expected: "2026-08-17T15:00:00.000Z | 2026-08-18T15:00:00.000Z",
    run: (m) =>
      `${m.kstNextDayStart("2026-08-17").toISOString()} | ${m
        .kstNextDayStart("2026-08-18")
        .toISOString()}`,
  },
  {
    // 시간대와 무관한 순수 검사. 표에 있어야 「모든 export」가 성립한다.
    name: "isCanonicalTimeInput",
    expected: "true | false",
    run: (m) => `${m.isCanonicalTimeInput("23:59")} | ${m.isCanonicalTimeInput("24:00")}`,
  },
];

/**
 * TZ 원복은 반드시 finally/afterEach에서 한다 — 단언이 실패해도 다음 파일로
 * 새면 안 된다. 원래 값이 없었다면 `delete`여야 한다: 대입하면 "undefined"라는
 * **문자열**이 박혀, 그 뒤로는 존재하지 않는 시간대를 쓰게 된다.
 */
const ORIGINAL_TZ = process.env.TZ;

function restoreTz(): void {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
}

afterEach(() => {
  restoreTz();
  vi.resetModules();
});

afterAll(restoreTz);

/**
 * TZ를 바꾼 뒤 모듈을 새로 임포트해 모든 probe를 돌린다.
 *
 * 임포트도 실행도 바뀐 TZ 아래에서 일어난다 — 포맷터가 만들어지는 순간과
 * 쓰이는 순간이 둘 다 덮여야, 최상위 캐시든 함수 안에서 새로 만드는 것이든
 * 똑같이 걸린다.
 */
async function runUnderTz(tz: string): Promise<Record<string, string>> {
  process.env.TZ = tz;
  vi.resetModules();
  try {
    const mod: DateTimeModule = await import("@/lib/datetime");
    return Object.fromEntries(PROBES.map((probe) => [probe.name, probe.run(mod)]));
  } finally {
    restoreTz();
  }
}

describe("datetime은 서버 시간대를 따라가지 않는다", () => {
  it.each(ZONES)("TZ=%s에서도 모든 export가 KST 값을 낸다", async (tz) => {
    const actual = await runUnderTz(tz);

    for (const probe of PROBES) {
      // 이름을 함께 비교한다 — 실패 메시지만 보고 어느 함수인지 알 수 있어야 한다.
      expect(`${probe.name}: ${actual[probe.name]}`).toBe(
        `${probe.name}: ${probe.expected}`,
      );
    }
  });

  it("네 시간대의 결과가 서로 한 글자도 다르지 않다", async () => {
    // 순차로 돈다 — process.env.TZ는 프로세스 전역이라 병렬로 바꾸면 섞인다.
    const collected: Record<string, string>[] = [];
    for (const tz of ZONES) collected.push(await runUnderTz(tz));

    const [first, ...rest] = collected;
    for (const other of rest) {
      expect(other).toEqual(first);
    }
  });
});

describe("모든 export를 덮는다", () => {
  /**
   * 이 테스트가 이 파일의 자물쇠다. 새 포맷터를 추가하고 위 표에 넣지 않으면
   * 여기서 깨진다 — 「시간대 검증을 빠뜨린 export」가 조용히 생기지 못한다.
   */
  it("표에 없는 export가 생기면 깨진다", async () => {
    process.env.TZ = "UTC";
    vi.resetModules();
    const mod: DateTimeModule = await import("@/lib/datetime");
    restoreTz();

    const exported = Object.keys(mod).sort();
    const covered = PROBES.map((probe) => probe.name).sort();

    expect(exported).toEqual(covered);
  });

  it("표에 이름이 중복으로 들어가 있지 않다", () => {
    expect(new Set(PROBES.map((probe) => probe.name)).size).toBe(PROBES.length);
  });
});
