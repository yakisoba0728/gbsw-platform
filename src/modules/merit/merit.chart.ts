import { KST } from "@/lib/datetime";
import {
  addKindPoints,
  emptyKindTotals,
  meritKindDelta,
  withNetScore,
  type KindTotals,
} from "@/core/authz/merit-track";

/**
 * 그래프에 넣을 값을 만드는 순수 함수들. 종류를 다루는 일은 merit-track에 맡긴다 —
 * 종류가 늘어도 이 파일은 안 고쳐도 된다.
 */

export type ChartAward = {
  /** 발생일로 센다 — 6월 벌점이 8월 막대에 서면 그래프가 거짓말이 된다. */
  occurredOn: Date;
  kind: string;
  points: number;
  rule: { category: string | null } | null;
};

export type MonthlyPoint = {
  /** `2026-03` — 축 라벨과 key로 함께 쓴다. */
  key: string;
  /** `3월` */
  label: string;
  merit: number;
  demerit: number;
  offset: number;
  net: number;
};

/** KST 기준 연·월. UTC로 자르면 밤 9시 이후 부여가 전날(전월)로 밀린다. */
function kstYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * 학년도의 12개월 축 — 3월부터 이듬해 2월까지.
 * 1~12월로 그리면 한 학년도가 두 토막으로 보인다.
 */
export function schoolYearMonths(year: number): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = [];
  for (let i = 0; i < 12; i += 1) {
    const month = ((2 + i) % 12) + 1; // 3,4,…,12,1,2
    const calendarYear = month >= 3 ? year : year + 1;
    months.push({ key: monthKey(calendarYear, month), label: `${month}월` });
  }
  return months;
}

/**
 * 학년도가 덮는 기간. schoolYearMonths와 어긋나면 안 된다 — 창이 축보다 넓으면
 * 검증을 통과한 기록이 그래프에서 조용히 사라진다. 테스트가 둘을 맞춰 본다.
 */
export function schoolYearRange(year: number): { start: Date; endExclusive: Date } {
  return {
    start: new Date(`${year}-03-01T00:00:00+09:00`),
    endExclusive: new Date(`${year + 1}-03-01T00:00:00+09:00`),
  };
}

/**
 * 최근 12개월 축 (누적이라 학년도 경계가 없는 경우).
 * `now`를 인자로 받는다 — 함수 안에서 읽으면 테스트가 날짜에 흔들린다.
 */
export function rollingMonths(now: Date): { key: string; label: string }[] {
  const { year, month } = kstYearMonth(now);
  const months: { key: string; label: string }[] = [];

  for (let back = 11; back >= 0; back -= 1) {
    // month는 1~12이므로 0-based로 옮겨 계산한 뒤 되돌린다.
    const zero = month - 1 - back;
    const calendarYear = year + Math.floor(zero / 12);
    const m = ((zero % 12) + 12) % 12 + 1;
    months.push({ key: monthKey(calendarYear, m), label: `${m}월` });
  }
  return months;
}

/**
 * 월별 합계. 기록이 없는 달도 0으로 남는다 — 빈 달을 빼면 시간 간격이 왜곡된다.
 */
export function monthlyTotals(
  awards: ChartAward[],
  axis: { key: string; label: string }[],
): MonthlyPoint[] {
  const buckets = new Map<string, KindTotals>();
  for (const { key } of axis) {
    buckets.set(key, emptyKindTotals());
  }

  for (const award of awards) {
    const { year, month } = kstYearMonth(award.occurredOn);
    const bucket = buckets.get(monthKey(year, month));
    // 축 밖의 기록은 버린다 — 축을 늘리면 그래프가 못 읽힌다.
    if (!bucket) continue;

    addKindPoints(bucket, award.kind, award.points);
  }

  return axis.map(({ key, label }) => ({
    key,
    label,
    ...withNetScore(buckets.get(key)!),
  }));
}

export type CategorySlice = {
  category: string;
  kind: string;
  count: number;
  points: number;
};

/**
 * 분류별 분포. 부여 기록은 분류를 스냅샷하지 않으므로 규정 쪽에서 가져온다.
 * 종류별로 나눈다 — 같은 분류에 상점과 벌점이 다 있을 수 있다.
 */
export function categoryDistribution(awards: ChartAward[]): CategorySlice[] {
  const map = new Map<string, CategorySlice>();

  for (const award of awards) {
    const category = award.rule?.category ?? "분류 없음";
    const key = `${award.kind}::${category}`;
    const cur =
      map.get(key) ?? { category, kind: award.kind, count: 0, points: 0 };
    cur.count += 1;
    cur.points += award.points;
    map.set(key, cur);
  }

  return [...map.values()].sort(
    (a, b) =>
      // 상점이 먼저, 그 안에서 건수가 많은 것부터.
      meritKindDelta(b.kind) - meritKindDelta(a.kind) || b.count - a.count,
  );
}

/** 막대 길이를 %로. 가장 큰 값이 100%가 되고, 전부 0이면 전부 0%다. */
export function scaleToPercent(values: number[]): number[] {
  const max = Math.max(0, ...values.map(Math.abs));
  if (max === 0) return values.map(() => 0);
  return values.map((v) => Math.round((Math.abs(v) / max) * 100));
}
