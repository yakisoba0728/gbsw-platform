import {
  isMeritKind,
  MERIT_KINDS,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";

// 상벌점 산술 — core 커널의 트랙·종류 정의를 받아 종류별 합계와 순점수를 계산한다.
// 합계를 조용히 틀리지 않도록 모르는 종류는 어느 칸도 움직이지 않는다.

export type KindTotals = { merit: number; demerit: number; offset: number };

export type NetTotals = KindTotals & { net: number };

export type DemeritThresholds = { warn: number; danger: number };

export const DEFAULT_DEMERIT_THRESHOLDS: Record<MeritTrack, DemeritThresholds> = {
  SCHOOL: { warn: 20, danger: 30 },
  DORM: { warn: 20, danger: 30 },
};

export type DemeritLevel = "none" | "warn" | "danger";

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

export function meritKindDelta(kind: string): 1 | -1 | 0 {
  if (kind === "MERIT" || kind === "OFFSET") return 1;
  if (kind === "DEMERIT") return -1;
  return 0;
}

export function meritKindSign(kind: string): "+" | "−" | "" {
  const delta = meritKindDelta(kind);
  return delta === 1 ? "+" : delta === -1 ? "−" : "";
}

export function signedNet(net: number): string {
  return net >= 0 ? `+${net}` : String(net);
}

export function demeritLevel(
  thresholds: DemeritThresholds,
  demerit: number,
): DemeritLevel {
  if (demerit >= thresholds.danger) return "danger";
  if (demerit >= thresholds.warn) return "warn";
  return "none";
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
