import {
  isYearScoped,
  MERIT_KIND_LABELS,
  MERIT_TRACK_LABELS,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { formatDateInput, formatDateTimeSheet } from "@/lib/datetime";
import { meritKindDelta } from "./merit.points";
import type {
  RecentAwardFilter,
  RecentAwardStatus,
} from "./merit.schema";

function sheetPoints(kind: string, points: number): number {
  return meritKindDelta(kind) === -1 ? -points : points;
}

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

export const ROSTER_SHEET_WIDTHS: number[] = [
  6,
  12,
  12,
  8,
  8,
  8,
  10,
];

export function toRosterSheet(
  rows: RosterRow[],
  meta: { track: MeritTrack; year: number; grade: number; classNo: number },
): (string | number)[][] {
  return [
    [rosterScope(meta)],
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

export const HISTORY_SHEET_WIDTHS: number[] = [
  8,
  12,
  12,
  8,
  46,
  8,
  28,
  12,
  8,
  28,
];

export const HISTORY_SHEET_WRAP = [4];

type RecentAwardExportRow = {
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

export const RECENT_SHEET_WIDTHS: number[] = [
  8,
  20,
  12,
  12,
  8,
  46,
  8,
  28,
  12,
  8,
  12,
  20,
  28,
];

export const RECENT_SHEET_WRAP = [5];

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
