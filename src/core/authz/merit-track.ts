/** 상벌점 트랙. Prisma의 MeritRule.track·MeritAward.track과 일치해야 한다. */
export const MERIT_TRACKS = ["SCHOOL", "DORM"] as const;

export type MeritTrack = (typeof MERIT_TRACKS)[number];

export const MERIT_TRACK_LABELS: Record<MeritTrack, string> = {
  SCHOOL: "교내",
  DORM: "기숙사",
};

/**
 * 화면 제목에 쓰는 이름. `MERIT_TRACK_LABELS`(교내·기숙사)는 표 안처럼 좁은
 * 자리의 짧은 표기고, 이쪽은 메뉴(nav.ts)에 적힌 정식 이름이다 — 상단바 제목이
 * 쿼리를 못 보므로 두 트랙을 가르는 글자가 화면 안에 반드시 하나는 있어야 한다.
 */
export const MERIT_TRACK_TITLES: Record<MeritTrack, string> = {
  SCHOOL: "그린마일리지",
  DORM: "기숙사 상벌점",
};

export function isMeritTrack(value: unknown): value is MeritTrack {
  return (
    typeof value === "string" && (MERIT_TRACKS as readonly string[]).includes(value)
  );
}

/**
 * 합계를 그 학년도만 세는가. 교내는 매년 새로 시작하고 기숙사는 누적된다.
 * "초기화"는 지우는 작업이 아니라 이 조회 범위다 — 지난 기록은 그대로 남는다.
 */
export function isYearScoped(track: MeritTrack): boolean {
  return track === "SCHOOL";
}

/**
 * 상벌점 종류. 상쇄점은 상점이 아니라 벌점을 덜어내는 행정 조치다 —
 * 상점에 섞으면 총합이 부풀어 표창 기준이 흔들린다.
 */
export const MERIT_KINDS = ["MERIT", "DEMERIT", "OFFSET"] as const;

export type MeritKind = (typeof MERIT_KINDS)[number];

export const MERIT_KIND_LABELS: Record<MeritKind, string> = {
  MERIT: "상점",
  DEMERIT: "벌점",
  OFFSET: "상쇄점",
};

/** 부여 항목 선택지의 짧은 표기 — `[상 5점]` · `[벌 3점]` · `[상쇄 60점]`. */
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

/**
 * 순점수 = 상점 + 상쇄점 − 벌점. 상쇄점은 +다 — 벌점을 덜어내므로 올린다.
 * 모르는 값은 0을 준다 — 합계가 조용히 틀어지느니 안 세는 편이 낫다.
 */
export function meritKindDelta(kind: string): 1 | -1 | 0 {
  if (kind === "MERIT" || kind === "OFFSET") return 1;
  if (kind === "DEMERIT") return -1;
  return 0;
}

/** 화면에 붙는 부호 문자. 종류가 정하며 사용자가 바꿀 수 없다. */
export function meritKindSign(kind: string): "+" | "−" | "" {
  const delta = meritKindDelta(kind);
  return delta === 1 ? "+" : delta === -1 ? "−" : "";
}

/** 종류별 합계. 상쇄점을 상점에도 벌점에도 접지 않는다 — 순점수에서만 만난다. */
export type KindTotals = { merit: number; demerit: number; offset: number };

/** 세 칸에 순점수까지 붙인 모양. 화면이 받는 값이다. */
export type NetTotals = KindTotals & { net: number };

/** 종류 → 들어갈 칸. Record라 종류가 늘면 이 줄이 타입 검사에서 먼저 깨진다. */
const KIND_BUCKETS: Record<MeritKind, keyof KindTotals> = {
  MERIT: "merit",
  DEMERIT: "demerit",
  OFFSET: "offset",
};

/** 중복 없는 칸 목록. KIND_BUCKETS에서 저절로 따라온다. */
const KIND_BUCKET_LIST = [...new Set(Object.values(KIND_BUCKETS))];

export function emptyKindTotals(): KindTotals {
  return { merit: 0, demerit: 0, offset: 0 };
}

/**
 * 한 건을 제 칸에 더한다. 수천 건을 접는 자리라 제자리에서 고친다.
 * 모르는 종류는 어느 칸에도 넣지 않는다 (meritKindDelta와 같은 판단).
 */
export function addKindPoints(totals: KindTotals, kind: string, points: number): void {
  if (!isMeritKind(kind)) return;
  totals[KIND_BUCKETS[kind]] += points;
}

/** 이미 칸이 나뉜 합계끼리 더한다 — 학생별 합계를 반별로 모을 때 쓴다. */
export function addKindTotals(target: KindTotals, source: KindTotals): void {
  for (const bucket of KIND_BUCKET_LIST) {
    target[bucket] += source[bucket];
  }
}

/** 순점수. 부호는 meritKindDelta에서 끌어낸다 — 규칙이 한 곳에만 있어야 한다. */
export function netScore(totals: KindTotals): number {
  return MERIT_KINDS.reduce(
    (sum, kind) => sum + meritKindDelta(kind) * totals[KIND_BUCKETS[kind]],
    0,
  );
}

/** 세 칸에 순점수를 붙여 화면이 쓰는 모양으로 만든다. */
export function withNetScore(totals: KindTotals): NetTotals {
  return { ...totals, net: netScore(totals) };
}

/** 순점수의 화면 표기 — `+7` · `-3`. 음수는 보통 하이픈이다 (배지의 −와 다르다). */
export function signedNet(net: number): string {
  return net >= 0 ? `+${net}` : String(net);
}

/** 벌점 누적 기준점 한 쌍. 경고보다 위험이 커야 한다 (merit.schema.ts가 지킨다). */
export type DemeritThresholds = { warn: number; danger: number };

/**
 * 벌점 누적 기준점의 기본값 — MeritThreshold 행이 없을 때 떨어질 자리다.
 * 시스템은 표시만 한다. 기준을 넘겨도 자동으로 조치하지 않는다.
 */
export const DEFAULT_DEMERIT_THRESHOLDS: Record<MeritTrack, DemeritThresholds> = {
  SCHOOL: { warn: 20, danger: 30 },
  DORM: { warn: 20, danger: 30 },
};

export type DemeritLevel = "none" | "warn" | "danger";

/**
 * 벌점 누적 단계. 상점·상쇄점과 무관하게 벌점 총합만 본다 (순점수와 다른 지표다).
 * 기준은 인자로 받는다 — 읽는 일은 서비스가 맡고 여기는 DB를 모른다.
 */
export function demeritLevel(
  thresholds: DemeritThresholds,
  demerit: number,
): DemeritLevel {
  if (demerit >= thresholds.danger) return "danger";
  if (demerit >= thresholds.warn) return "warn";
  return "none";
}
