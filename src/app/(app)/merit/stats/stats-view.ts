/**
 * 통계 화면의 갈래.
 *
 * 넷을 메뉴 네 줄로 갈라 두었더니 서로 오갈 길이 사이드바밖에 없었다 — 넷 다
 * 같은 조회 조건(트랙·학년도, 둘은 반까지)을 쓰는 같은 자료의 다른 각도인데,
 * 각도를 고르는 일이 화면 밖에 있었다. 교내·기숙사를 화면 안 탭으로 고르는 것과
 * 같은 규칙으로 옮긴다.
 */

export const STATS_VIEWS = ["overview", "ranking", "teachers", "rules"] as const;

export type StatsView = (typeof STATS_VIEWS)[number];

export const STATS_VIEW_LABELS: Record<StatsView, string> = {
  overview: "개요",
  ranking: "순위 · 현황",
  teachers: "교사별",
  rules: "규정별",
};

/** 반을 골라 좁힐 수 있는 갈래. 나머지는 학년·반 쿼리를 무시한다. */
export const STATS_VIEW_SCOPED: Record<StatsView, boolean> = {
  overview: true,
  ranking: true,
  teachers: false,
  rules: false,
};

/** 주소에서 온 값. 모르는 값은 개요로 떨어진다 — 화면이 비는 것보다 낫다. */
export function parseStatsView(value: unknown): StatsView {
  return typeof value === "string" && (STATS_VIEWS as readonly string[]).includes(value)
    ? (value as StatsView)
    : "overview";
}

/** 기본 갈래는 주소에 싣지 않는다 — `/merit/stats`가 곧 개요다. */
export function statsViewParam(view: StatsView): string | null {
  return view === "overview" ? null : view;
}
