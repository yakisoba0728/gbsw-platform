import {
  isYearScoped,
  MERIT_KIND_LABELS,
  MERIT_TRACK_LABELS,
  meritKindDelta,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { formatDateInput, formatDateTimeSheet } from "@/lib/datetime";
import type {
  RecentAwardFilter,
  RecentAwardStatus,
} from "./merit.schema";

/**
 * 엑셀 행렬을 만드는 순수 함수들. null을 내보내지 않는다 — write-excel-file이
 * null 셀을 만나면 열의 타입 추론이 흔들려 숫자 열이 문자열로 나간다. 빈 값은 "".
 *
 * 시트마다 열 너비표를 함께 낸다. 엑셀 기본 너비(8.43자)로는 한글이 서너 자만
 * 보이고 나머지가 옆 칸을 덮어써서, 파일을 열면 글자가 겹친 덩어리로 보인다 —
 * 규정 이름처럼 스무 자 넘는 열이 있는 시트에서는 표가 아예 읽히지 않는다.
 * 표는 명단 내보내기(`roster.export.ts`)와 같은 방식으로 손으로 적는다.
 */

/**
 * 시트에 적을 점수. 벌점은 음수다 — 화면이 `−30`으로 그리는 것과 같은 뜻이고,
 * 무엇보다 열을 그대로 더할 수 있어야 한다. 부호 판정은 `meritKindDelta` 하나가
 * 가지고 있으므로 여기서 다시 정하지 않는다. 모르는 종류(delta 0)는 값을 그대로
 * 둔다 — 0으로 접으면 그 줄의 점수가 조용히 사라진다.
 */
function sheetPoints(kind: string, points: number): number {
  return meritKindDelta(kind) === -1 ? -points : points;
}

/** "2026학년도 2학년 3반 · 교내" / "2학년 3반 · 기숙사(누적)" */
function rosterScope(meta: {
  track: MeritTrack;
  year: number;
  grade: number;
  classNo: number;
}): string {
  const where = `${meta.grade}학년 ${meta.classNo}반`;
  return isYearScoped(meta.track)
    ? `${meta.year}학년도 ${where} · ${MERIT_TRACK_LABELS[meta.track]}`
    : `${where} · ${MERIT_TRACK_LABELS[meta.track]}(누적)`;
}

export type RosterRow = {
  studentProfileId: string;
  studentCode: string;
  name: string;
  number: number | null;
  merit: number;
  demerit: number;
  offset: number;
  net: number;
};

/** 열 너비(문자 단위). toRosterSheet의 머리글 순서와 하나씩 맞춘다. */
export const ROSTER_SHEET_WIDTHS: number[] = [
  6, // 번호
  12, // 이름
  12, // 학생코드
  8, // 상점
  8, // 벌점
  8, // 상쇄
  10, // 순점수
];

export function toRosterSheet(
  rows: RosterRow[],
  meta: { track: MeritTrack; year: number; grade: number; classNo: number },
): (string | number)[][] {
  return [
    // 교내(그 학년도)와 기숙사(누적)는 같은 숫자가 다른 뜻이다. 파일명은 바뀌어도
    // 시트 첫 줄은 남으므로 여기에 범위를 적는다.
    [rosterScope(meta)],
    // 상쇄 열은 0이어도 항상 낸다. 순점수 = 상점 + 상쇄 − 벌점.
    ["번호", "이름", "학생코드", "상점", "벌점", "상쇄", "순점수"],
    ...rows.map((r) => [
      r.number ?? "",
      r.name,
      r.studentCode,
      r.merit,
      r.demerit,
      r.offset,
      r.net,
    ]),
  ];
}

export type HistoryRow = {
  year: number;
  kind: string;
  label: string;
  points: number;
  note: string | null;
  awardedByName: string;
  status: string;
  cancelReason: string | null;
  occurredOn: Date;
  createdAt: Date;
};

/**
 * 한 학생의 내역 시트. 발생일과 입력일을 둘 다 낸다 — 시트는 화면을 떠나
 * 돌아다니고, 두 날짜가 갈린 기록을 되짚을 흔적은 이 두 열뿐이다.
 */
export function toHistorySheet(
  awards: HistoryRow[],
  meta: { track: MeritTrack; studentName: string },
): (string | number)[][] {
  return [
    [`${meta.studentName} · ${MERIT_TRACK_LABELS[meta.track]} 상벌점`],
    [
      "학년도",
      "발생일",
      "입력일",
      "구분",
      "항목",
      "점수",
      "메모",
      "부여자",
      "상태",
      "취소사유",
    ],
    ...awards.map((a) => [
      a.year,
      formatDateInput(a.occurredOn),
      formatDateInput(a.createdAt),
      MERIT_KIND_LABELS[a.kind as MeritKind] ?? a.kind,
      a.label,
      sheetPoints(a.kind, a.points),
      a.note ?? "",
      a.awardedByName,
      a.status === "CANCELLED" ? "취소" : "반영",
      a.cancelReason ?? "",
    ]),
  ];
}

/** 열 너비(문자 단위). toHistorySheet의 머리글 순서와 하나씩 맞춘다. */
export const HISTORY_SHEET_WIDTHS: number[] = [
  8, // 학년도
  12, // 발생일
  12, // 입력일
  8, // 구분
  46, // 항목 — 규정 이름이 길다. 이 시트에서 가장 넓은 열이다
  8, // 점수
  28, // 메모
  12, // 부여자
  8, // 상태
  28, // 취소사유
];

/** 접을 열. 규정 이름은 46자로도 한 줄에 안 들어간다. */
export const HISTORY_SHEET_WRAP = [4]; // 항목

export type RecentAwardExportRow = {
  year: number;
  studentName: string;
  kind: string;
  label: string;
  points: number;
  note: string | null;
  awardedByName: string;
  status: string;
  cancelledByName: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  occurredOn: Date;
  createdAt: Date;
};

const RECENT_STATUS_LABELS: Record<RecentAwardStatus, string> = {
  ACTIVE: "반영",
  CANCELLED: "취소",
};

/** 열 너비(문자 단위). toRecentAwardsSheet의 머리글 순서와 하나씩 맞춘다. */
export const RECENT_SHEET_WIDTHS: number[] = [
  8, // 학년도
  20, // 입력 시각
  12, // 발생일
  12, // 학생
  8, // 구분
  46, // 항목 — 규정 이름이 길다. 이 시트에서 가장 넓은 열이다
  8, // 점수
  28, // 메모
  12, // 부여자
  8, // 상태
  12, // 취소자
  20, // 취소 시각
  28, // 취소 사유
];

/** 접을 열. 규정 이름은 46자로도 한 줄에 안 들어간다. */
export const RECENT_SHEET_WRAP = [5]; // 항목

/** 현재 화면의 필터 전체를 내려받는다. 첫 줄에도 범위를 남겨 파일만 봐도 조건을 안다. */
export function toRecentAwardsSheet(
  awards: RecentAwardExportRow[],
  filter: RecentAwardFilter,
): (string | number)[][] {
  const scope = [
    `${MERIT_TRACK_LABELS[filter.track]} 최근 부여`,
    filter.kind ? MERIT_KIND_LABELS[filter.kind] : "전체 종류",
    filter.status ? RECENT_STATUS_LABELS[filter.status] : "전체 상태",
    filter.q ? `검색: ${filter.q}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    [scope],
    [
      "학년도",
      "입력 시각",
      "발생일",
      "학생",
      "구분",
      "항목",
      "점수",
      "메모",
      "부여자",
      "상태",
      "취소자",
      "취소 시각",
      "취소 사유",
    ],
    ...awards.map((award) => [
      award.year,
      formatDateTimeSheet(award.createdAt),
      formatDateInput(award.occurredOn),
      award.studentName,
      MERIT_KIND_LABELS[award.kind as MeritKind] ?? award.kind,
      award.label,
      sheetPoints(award.kind, award.points),
      award.note ?? "",
      award.awardedByName,
      award.status === "CANCELLED" ? "취소" : "반영",
      award.cancelledByName ?? "",
      award.cancelledAt ? formatDateTimeSheet(award.cancelledAt) : "",
      award.cancelReason ?? "",
    ]),
  ];
}
