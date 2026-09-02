import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type * as DateTime from "@/lib/datetime";

type DateTimeModule = typeof DateTime;

const ZONES = ["UTC", "America/New_York", "Asia/Seoul", "Pacific/Kiritimati"] as const;

const BEFORE_MIDNIGHT = new Date("2026-08-17T14:59:59.999Z");
const AFTER_MIDNIGHT = new Date("2026-08-17T15:00:00.000Z");

type Probe = {
  name: keyof DateTimeModule;
  expected: string;
  run: (m: DateTimeModule) => string;
};

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
    name: "formatDateInput",
    expected: "2026-08-17 | 2026-08-18",
    run: (m) => bothSides(m.formatDateInput),
  },
  {
    name: "kstDayStart",
    expected: "2026-08-16T15:00:00.000Z | 2026-08-17T15:00:00.000Z",
    run: (m) => bothSides((value) => m.kstDayStart(value).toISOString()),
  },
  {
    name: "isSameKstDate",
    expected: "false | true",
    run: (m) =>
      `${m.isSameKstDate(BEFORE_MIDNIGHT, AFTER_MIDNIGHT)} | ${m.isSameKstDate(
        AFTER_MIDNIGHT,
        AFTER_MIDNIGHT,
      )}`,
  },
  {
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
    name: "kstNextDayStart",
    expected: "2026-08-17T15:00:00.000Z | 2026-08-18T15:00:00.000Z",
    run: (m) =>
      `${m.kstNextDayStart("2026-08-17").toISOString()} | ${m
        .kstNextDayStart("2026-08-18")
        .toISOString()}`,
  },
  {
    name: "isCanonicalTimeInput",
    expected: "true | false",
    run: (m) => `${m.isCanonicalTimeInput("23:59")} | ${m.isCanonicalTimeInput("24:00")}`,
  },
];

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
      expect(`${probe.name}: ${actual[probe.name]}`).toBe(
        `${probe.name}: ${probe.expected}`,
      );
    }
  });

  it("네 시간대의 결과가 서로 한 글자도 다르지 않다", async () => {
    const collected: Record<string, string>[] = [];
    for (const tz of ZONES) collected.push(await runUnderTz(tz));

    const [first, ...rest] = collected;
    for (const other of rest) {
      expect(other).toEqual(first);
    }
  });
});

describe("모든 export를 덮는다", () => {
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
