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

export const MERIT_KINDS = ["MERIT", "DEMERIT"] as const;

export type MeritKind = (typeof MERIT_KINDS)[number];

export const MERIT_KIND_LABELS: Record<MeritKind, string> = {
  MERIT: "상점",
  DEMERIT: "벌점",
};

export function isMeritKind(value: unknown): value is MeritKind {
  return (
    typeof value === "string" && (MERIT_KINDS as readonly string[]).includes(value)
  );
}
