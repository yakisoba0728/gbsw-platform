import {
  isPassStatus,
  isPassType,
  PASS_STATUS_LABELS,
  PASS_TYPE_LABELS,
} from "@/core/authz/pass-type";
import { formatDateInput, formatDateTimeSheet } from "@/lib/datetime";
import { formatStudentNumber } from "@/lib/student-number";
import { passStatusLabel } from "./pass.labels";
import type { PassHistoryExportInput } from "./pass.schema";

export type PassHistoryExportRow = {
  type: string;
  status: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  studentName: string;
  startAt: Date;
  endAt: Date;
  destination: string;
  reason: string;
  requestedByName: string;
  consentedByName: string | null;
  consentedAt: Date | null;
  consentByProxy: boolean;
  consentNote: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  cancelledByName: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
};

function consentCell(row: PassHistoryExportRow): string {
  if (row.consentedAt === null && !row.consentByProxy) return "";

  const who = row.consentedByName ?? "";
  const base = row.consentByProxy ? (who ? `대행 · ${who}` : "대행") : who;
  return row.consentNote ? `${base} · ${row.consentNote}` : base;
}

function remarkCell(row: PassHistoryExportRow): string {
  const parts: string[] = [];
  if (row.decisionNote) {
    parts.push(
      `${row.status === "REJECTED" ? "반려 사유" : "승인 메모"} · ${row.decisionNote}`,
    );
  }
  if (row.status === "CANCELLED") {
    parts.push(row.cancelReason ? `취소 사유 · ${row.cancelReason}` : "취소");
  }
  return parts.join(" / ");
}

export const PASS_HISTORY_SHEET_WIDTHS: number[] = [
  8,
  12,
  6,
  6,
  6,
  8,
  12,
  20,
  20,
  20,
  32,
  12,
  20,
  12,
  20,
  32,
];

export const PASS_HISTORY_SHEET_WRAP = [9, 10, 15];

const HEADERS = [
  "유형",
  "상태",
  "학년",
  "반",
  "번호",
  "학번",
  "이름",
  "시작",
  "종료",
  "행선지",
  "사유",
  "신청자",
  "보호자확인",
  "결재자",
  "결재시각",
  "비고",
] as const;

function historyScope(
  filter: PassHistoryExportInput,
  range: { since: Date; until: Date | null },
): string {
  const period = `${formatDateInput(range.since)} ~ ${
    range.until ? formatDateInput(new Date(range.until.getTime() - 1)) : "이후"
  }`;

  return [
    "출입증 전체 내역",
    period,
    filter.type ? PASS_TYPE_LABELS[filter.type] : "전체 유형",
    filter.status ? PASS_STATUS_LABELS[filter.status] : "전체 상태",
    filter.q ? `검색: ${filter.q}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function toPassHistorySheet(
  rows: PassHistoryExportRow[],
  filter: PassHistoryExportInput,
  range: { since: Date; until: Date | null },
): (string | number)[][] {
  return [
    [historyScope(filter, range)],
    [...HEADERS],
    ...rows.map((row) => [
      isPassType(row.type) ? PASS_TYPE_LABELS[row.type] : row.type,
      isPassStatus(row.status) ? passStatusLabel(row) : row.status,
      row.grade ?? "",
      row.classNo ?? "",
      row.number ?? "",
      formatStudentNumber(row) ?? "",
      row.studentName,
      formatDateTimeSheet(row.startAt),
      formatDateTimeSheet(row.endAt),
      row.destination,
      row.reason,
      row.requestedByName,
      consentCell(row),
      row.decidedByName ?? "",
      row.decidedAt ? formatDateTimeSheet(row.decidedAt) : "",
      remarkCell(row),
    ]),
  ];
}
