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
 * 벌점 누적 기준점.
 *
 * **이 숫자는 학교가 정하는 값이며 지금은 임시값이다.** 실제 학칙·기숙사 규정의
 * 수치로 바꿔야 한다 — 화면에 "기준 30점"처럼 그대로 노출되므로 틀리면 바로 보인다.
 *
 * 시스템은 **표시만 한다.** 기준을 넘겨도 자동으로 회부·퇴사 같은 조치를 하지
 * 않는다. 불이익을 주는 판단은 사람이 하고, 여기서는 "눈에 띄게" 해줄 뿐이다.
 */
export const DEMERIT_THRESHOLDS: Record<MeritTrack, { warn: number; danger: number }> =
  {
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
 */
export function demeritLevel(track: MeritTrack, demerit: number): DemeritLevel {
  const { warn, danger } = DEMERIT_THRESHOLDS[track];
  if (demerit >= danger) return "danger";
  if (demerit >= warn) return "warn";
  return "none";
}
