export const MERIT_TRACKS = ["SCHOOL", "DORM"] as const;

export type MeritTrack = (typeof MERIT_TRACKS)[number];

export const MERIT_TRACK_LABELS: Record<MeritTrack, string> = {
  SCHOOL: "교내",
  DORM: "기숙사",
};

export const MERIT_TRACK_TITLES: Record<MeritTrack, string> = {
  SCHOOL: "그린마일리지",
  DORM: "기숙사 상벌점",
};

export function isMeritTrack(value: unknown): value is MeritTrack {
  return (
    typeof value === "string" && (MERIT_TRACKS as readonly string[]).includes(value)
  );
}

export function isYearScoped(track: MeritTrack): boolean {
  return track === "SCHOOL";
}

export const MERIT_KINDS = ["MERIT", "DEMERIT", "OFFSET"] as const;

export type MeritKind = (typeof MERIT_KINDS)[number];

export const MERIT_KIND_LABELS: Record<MeritKind, string> = {
  MERIT: "상점",
  DEMERIT: "벌점",
  OFFSET: "상쇄점",
};

export const MERIT_KIND_SHORT_LABELS: Record<MeritKind, string> = {
  MERIT: "상",
  DEMERIT: "벌",
  OFFSET: "상쇄",
};

export function isMeritKind(value: unknown): value is MeritKind {
  return (
    typeof value === "string" && (MERIT_KINDS as readonly string[]).includes(value)
  );
}

export function meritKindDelta(kind: string): 1 | -1 | 0 {
  if (kind === "MERIT" || kind === "OFFSET") return 1;
  if (kind === "DEMERIT") return -1;
  return 0;
}

export function meritKindSign(kind: string): "+" | "−" | "" {
  const delta = meritKindDelta(kind);
  return delta === 1 ? "+" : delta === -1 ? "−" : "";
}

export type KindTotals = { merit: number; demerit: number; offset: number };

export type NetTotals = KindTotals & { net: number };

const KIND_BUCKETS: Record<MeritKind, keyof KindTotals> = {
  MERIT: "merit",
  DEMERIT: "demerit",
  OFFSET: "offset",
};

const KIND_BUCKET_LIST = [...new Set(Object.values(KIND_BUCKETS))];

export function emptyKindTotals(): KindTotals {
  return { merit: 0, demerit: 0, offset: 0 };
}

export function addKindPoints(totals: KindTotals, kind: string, points: number): void {
  if (!isMeritKind(kind)) return;
  totals[KIND_BUCKETS[kind]] += points;
}

export function addKindTotals(target: KindTotals, source: KindTotals): void {
  for (const bucket of KIND_BUCKET_LIST) {
    target[bucket] += source[bucket];
  }
}

export function netScore(totals: KindTotals): number {
  return MERIT_KINDS.reduce(
    (sum, kind) => sum + meritKindDelta(kind) * totals[KIND_BUCKETS[kind]],
    0,
  );
}

export function withNetScore(totals: KindTotals): NetTotals {
  return { ...totals, net: netScore(totals) };
}

export function signedNet(net: number): string {
  return net >= 0 ? `+${net}` : String(net);
}

export type DemeritThresholds = { warn: number; danger: number };

export const DEFAULT_DEMERIT_THRESHOLDS: Record<MeritTrack, DemeritThresholds> = {
  SCHOOL: { warn: 20, danger: 30 },
  DORM: { warn: 20, danger: 30 },
};

export type DemeritLevel = "none" | "warn" | "danger";

export function demeritLevel(
  thresholds: DemeritThresholds,
  demerit: number,
): DemeritLevel {
  if (demerit >= thresholds.danger) return "danger";
  if (demerit >= thresholds.warn) return "warn";
  return "none";
}
