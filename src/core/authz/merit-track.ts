/**
 * 상벌점 트랙과 종류.
 *
 * 저장값은 영문 상수, 화면 표기는 라벨 — enrollment-status.ts와 같은 방식이다.
 * Prisma의 MeritRule.track·MeritAward.track과 일치해야 한다.
 */
export const MERIT_TRACKS = ["SCHOOL", "DORM"] as const;

export type MeritTrack = (typeof MERIT_TRACKS)[number];

export const MERIT_TRACK_LABELS: Record<MeritTrack, string> = {
  SCHOOL: "교내",
  DORM: "기숙사",
};

export function isMeritTrack(value: unknown): value is MeritTrack {
  return (
    typeof value === "string" && (MERIT_TRACKS as readonly string[]).includes(value)
  );
}

/**
 * 합계를 그 학년도만 세는가, 입학부터 전체를 세는가.
 *
 * 교내(그린마일리지)는 매년 새로 시작하고, 기숙사는 졸업까지 누적된다.
 * **"초기화"는 지우는 작업이 아니라 이 조회 범위다** — 학년도가 넘어가면
 * 합계가 저절로 0부터 시작하고 지난 기록은 그대로 남는다.
 */
export function isYearScoped(track: MeritTrack): boolean {
  return track === "SCHOOL";
}

/**
 * 상벌점 종류.
 *
 * **상쇄점은 상점이 아니다.** 잘한 일에 주는 점수가 아니라 선도관리위원회가
 * 의결로 벌점을 덜어내는 행정 조치다. 상점에 섞으면 상점 총합이 부풀어
 * 표창 기준이 흔들린다 — 그래서 종류를 따로 둔다.
 *
 * 순서는 학교 규정표와 같다: 상점 → 벌점 → 상쇄점.
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
 * 순점수에 더해지는 부호. **상쇄점은 +다** — 벌점을 덜어내므로 순점수를 올린다.
 *
 *   순점수 = 상점 + 상쇄점 − 벌점
 *
 * 모르는 값은 0을 준다. 합계가 조용히 틀어지는 것보다 안 세는 편이 낫다 —
 * 나중에 종류가 하나 더 생겼는데 이 함수를 안 고쳤다면 그 사실이 0으로 드러난다.
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

/**
 * 종류별 합계 — 상점·벌점·상쇄점이 각자 자기 칸에 남는다.
 *
 * **상쇄점을 상점에도 벌점에도 접지 않는다.** 상점 총합이 부풀면 표창 기준이,
 * 벌점 총합이 부풀면 징계 기준이 흔들린다. 셋은 순점수에서만 만난다.
 */
export type KindTotals = { merit: number; demerit: number; offset: number };

/** 세 칸에 순점수까지 붙인 모양. 화면이 실제로 받는 값이다. */
export type NetTotals = KindTotals & { net: number };

/**
 * 종류 → 들어갈 칸.
 *
 * **여기가 "종류가 늘어도 한 곳만 고치면 된다"의 실체다.** `Record<MeritKind, …>`라
 * MERIT_KINDS에 종류를 하나 더 넣는 순간 이 줄이 타입 검사에서 깨진다 —
 * 예전처럼 집계 네 곳의 if/else가 새 종류를 말없이 버리는 일이 생기지 않는다.
 */
const KIND_BUCKETS: Record<MeritKind, keyof KindTotals> = {
  MERIT: "merit",
  DEMERIT: "demerit",
  OFFSET: "offset",
};

/** 중복 없는 칸 목록. 종류가 늘어 칸이 늘어도 KIND_BUCKETS에서 저절로 따라온다. */
const KIND_BUCKET_LIST = [...new Set(Object.values(KIND_BUCKETS))];

export function emptyKindTotals(): KindTotals {
  return { merit: 0, demerit: 0, offset: 0 };
}

/**
 * 한 건(또는 한 묶음의 합)을 제 칸에 더한다. 제자리에서 고친다 —
 * 학생별·월별로 수천 건을 접는 자리라 매번 객체를 새로 만들지 않는다.
 *
 * 모르는 종류는 어느 칸에도 넣지 않는다. meritKindDelta가 0을 주는 것과 같은
 * 판단이다 — 합계가 조용히 틀어지느니 안 세는 편이 낫다. 다만 그 상황은
 * **스키마를 거치지 않고 쓰인 값**일 때만 생긴다. 개발자가 종류를 늘리는 쪽은
 * 위의 KIND_BUCKETS가 타입 검사에서 먼저 잡는다.
 */
export function addKindPoints(totals: KindTotals, kind: string, points: number): void {
  if (!isMeritKind(kind)) return;
  totals[KIND_BUCKETS[kind]] += points;
}

/**
 * 이미 칸이 나뉜 합계끼리 더한다 — 학생별 합계를 반별로 모을 때 쓴다.
 *
 * 손으로 `merit += … ; demerit += … ; offset += …`를 적지 않는 이유는
 * addKindPoints와 같다. 칸이 하나 늘면 그 줄만 빠뜨리기 딱 좋다.
 */
export function addKindTotals(target: KindTotals, source: KindTotals): void {
  for (const bucket of KIND_BUCKET_LIST) {
    target[bucket] += source[bucket];
  }
}

/**
 * 순점수 = 상점 + 상쇄점 − 벌점.
 *
 * 손으로 쓴 식이 아니라 meritKindDelta에서 끌어낸다 — 부호 규칙이 한 곳에만
 * 있어야 그래프의 막대와 합계 카드가 다른 이야기를 하지 않는다.
 */
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

/**
 * 순점수의 화면 표기 — `+7` · `-3` · `+0`.
 *
 * 음수 부호는 숫자가 이미 갖고 있는 보통 하이픈이다. 종류 배지의
 * `−`(meritKindSign, U+2212)와 다르다 — 저건 종류가 정하는 표기이고
 * 이건 계산 결과인 숫자 자체의 부호다.
 */
export function signedNet(net: number): string {
  return net >= 0 ? `+${net}` : String(net);
}

/** 벌점 누적 기준점 한 쌍. 경고보다 위험이 커야 한다 (merit.schema.ts가 지킨다). */
export type DemeritThresholds = { warn: number; danger: number };

/**
 * 벌점 누적 기준점의 **기본값**.
 *
 * 실제로 쓰이는 값은 관리자가 설정 화면(/admin/settings)에서 정하고 DB의
 * MeritThreshold에 저장된다. 여기 있는 숫자는 **그 행이 아직 없을 때 떨어질
 * 자리**다 — 학교가 한 번도 설정하지 않은 상태가 정상이고(설치 직후·빈 DB),
 * 그때도 화면이 멀쩡히 동작해야 하기 때문이다.
 *
 * 마이그레이션으로 행을 미리 심지 않는 이유는 threshold.service.ts에 적어 뒀다.
 *
 * 시스템은 **표시만 한다.** 기준을 넘겨도 자동으로 회부·퇴사 같은 조치를 하지
 * 않는다. 불이익을 주는 판단은 사람이 하고, 여기서는 "눈에 띄게" 해줄 뿐이다.
 */
export const DEFAULT_DEMERIT_THRESHOLDS: Record<MeritTrack, DemeritThresholds> = {
  // 교내(그린마일리지): 선도관리위원회 회부를 검토할 만한 수준.
  SCHOOL: { warn: 20, danger: 30 },
  // 기숙사(정심관): 누적이라 학년이 올라갈수록 쌓인다.
  DORM: { warn: 20, danger: 30 },
};

export type DemeritLevel = "none" | "warn" | "danger";

/**
 * 벌점 누적이 어느 단계인가. **상점·상쇄점과 무관하게 벌점 총합만 본다** —
 * 상점으로 벌점을 덮는다고 규정 위반이 없던 일이 되지는 않기 때문이다.
 * (순점수와는 다른 지표다.)
 *
 * **기준을 인자로 받는 순수 함수다.** 예전엔 트랙만 받아 모듈 상수를 직접
 * 읽었는데, 기준이 관리자 설정값이 되면서 "언제 어디서 읽느냐"가 생겼다.
 * 계산은 값을 받기만 하고 읽는 일은 서비스가 맡는다 — 그래야 화면·통계·
 * 그래프가 한 요청 안에서 같은 기준을 보고, 여기가 DB를 모른 채로 남는다.
 */
export function demeritLevel(
  thresholds: DemeritThresholds,
  demerit: number,
): DemeritLevel {
  if (demerit >= thresholds.danger) return "danger";
  if (demerit >= thresholds.warn) return "warn";
  return "none";
}
