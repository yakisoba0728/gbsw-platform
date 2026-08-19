import {
  isYearScoped,
  MERIT_KIND_LABELS,
  MERIT_TRACK_LABELS,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { formatDate, formatDateTime } from "@/lib/datetime";
import type {
  RecentAwardFilter,
  RecentAwardStatus,
} from "./merit.schema";

/**
 * 엑셀 행렬을 만드는 순수 함수들. null을 내보내지 않는다 — write-excel-file이
 * null 셀을 만나면 열의 타입 추론이 흔들려 숫자 열이 문자열로 나간다. 빈 값은 "".
 */

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
      formatDate(a.occurredOn),
      formatDate(a.createdAt),
      MERIT_KIND_LABELS[a.kind as MeritKind] ?? a.kind,
      a.label,
      a.points,
      a.note ?? "",
      a.awardedByName,
      a.status === "CANCELLED" ? "취소" : "반영",
      a.cancelReason ?? "",
    ]),
  ];
}

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
      formatDateTime(award.createdAt),
      formatDate(award.occurredOn),
      award.studentName,
      MERIT_KIND_LABELS[award.kind as MeritKind] ?? award.kind,
      award.label,
      award.points,
      award.note ?? "",
      award.awardedByName,
      award.status === "CANCELLED" ? "취소" : "반영",
      award.cancelledByName ?? "",
      award.cancelledAt ? formatDateTime(award.cancelledAt) : "",
      award.cancelReason ?? "",
    ]),
  ];
}
