import { KST } from "@/lib/datetime";
import {
  addKindPoints,
  emptyKindTotals,
  meritKindDelta,
  withNetScore,
  type KindTotals,
} from "@/core/authz/merit-track";

export type ChartAward = {
  occurredOn: Date;
  kind: string;
  points: number;
  rule: { category: string | null } | null;
};

export type MonthlyPoint = {
  key: string;
  label: string;
  merit: number;
  demerit: number;
  offset: number;
  net: number;
};

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

export function schoolYearMonths(year: number): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = [];
  for (let i = 0; i < 12; i += 1) {
    const month = ((2 + i) % 12) + 1;
    const calendarYear = month >= 3 ? year : year + 1;
    months.push({ key: monthKey(calendarYear, month), label: `${month}월` });
  }
  return months;
}

export function schoolYearRange(year: number): { start: Date; endExclusive: Date } {
  return {
    start: new Date(`${year}-03-01T00:00:00+09:00`),
    endExclusive: new Date(`${year + 1}-03-01T00:00:00+09:00`),
  };
}

export function rollingMonths(now: Date): { key: string; label: string }[] {
  const { year, month } = kstYearMonth(now);
  const months: { key: string; label: string }[] = [];

  for (let back = 11; back >= 0; back -= 1) {
    const zero = month - 1 - back;
    const calendarYear = year + Math.floor(zero / 12);
    const m = ((zero % 12) + 12) % 12 + 1;
    months.push({ key: monthKey(calendarYear, m), label: `${m}월` });
  }
  return months;
}

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
      meritKindDelta(b.kind) - meritKindDelta(a.kind) || b.count - a.count,
  );
}

export function scaleToPercent(values: number[]): number[] {
  const max = Math.max(0, ...values.map(Math.abs));
  if (max === 0) return values.map(() => 0);
  return values.map((v) => Math.round((Math.abs(v) / max) * 100));
}
