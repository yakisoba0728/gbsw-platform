
export const STATS_VIEWS = ["overview", "ranking", "teachers", "rules"] as const;

export type StatsView = (typeof STATS_VIEWS)[number];

export const STATS_VIEW_LABELS: Record<StatsView, string> = {
  overview: "개요",
  ranking: "순위 · 현황",
  teachers: "교사별",
  rules: "규정별",
};

export const STATS_VIEW_SCOPED: Record<StatsView, boolean> = {
  overview: true,
  ranking: true,
  teachers: false,
  rules: false,
};

export function parseStatsView(value: unknown): StatsView {
  return typeof value === "string" && (STATS_VIEWS as readonly string[]).includes(value)
    ? (value as StatsView)
    : "overview";
}

export function statsViewParam(view: StatsView): string | null {
  return view === "overview" ? null : view;
}
