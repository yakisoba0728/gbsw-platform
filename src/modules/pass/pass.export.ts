import {
  isPassStatus,
  isPassType,
  PASS_STATUS_LABELS,
  PASS_TYPE_LABELS,
} from "@/core/authz/pass-type";
import { formatDateInput, formatDateTimeSheet } from "@/lib/datetime";
import { formatStudentNumber } from "@/lib/student-number";
import { passEndMoment } from "./pass.labels";
import type { PassHistoryExportInput } from "./pass.schema";

/**
 * 엑셀 행렬을 만드는 순수 함수들 — `merit.export.ts`와 같은 모양이다.
 * null을 내보내지 않는다: write-excel-file이 null 셀을 만나면 열의 타입 추론이
 * 흔들려 숫자 열이 문자열로 나간다. 빈 값은 "".
 *
 * 열 너비표를 함께 낸다. 엑셀 기본 너비(8.43자)로는 한글이 서너 자만 보이고
 * 나머지가 옆 칸을 덮어써서, 사유·행선지가 있는 이 시트는 표로 읽히지 않는다.
 */

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

/**
 * 시작·종료의 눈금은 유형이 정한다 — 화면의 `passPeriod`와 같은 규칙이다.
 * 외출은 시각이 알맹이라 시각까지, 외박은 그 밤을 통째로 쓰므로 날짜만 적는다.
 * 두 형태가 한 열에 섞여도 글자순은 그대로 날짜순이다 (`2026-08-26` <
 * `2026-08-26 14:00:00`).
 */
function startCell(row: PassHistoryExportRow): string {
  return row.type === "OVERNIGHT"
    ? formatDateInput(row.startAt)
    : formatDateTimeSheet(row.startAt);
}

/**
 * **외박의 `endAt`을 그대로 적으면 하루 밀린다** — 종료일 다음 날 자정이기
 * 때문이다. 되돌리는 규칙은 `pass.labels.ts`가 갖고 있다.
 */
function endCell(row: PassHistoryExportRow): string {
  const moment = passEndMoment(row);
  return row.type === "OVERNIGHT"
    ? formatDateInput(moment)
    : formatDateTimeSheet(moment);
}

/** 「누가 확인했나」 한 칸. 대행이면 그 사실이 이름보다 먼저 읽혀야 한다. */
function consentCell(row: PassHistoryExportRow): string {
  if (row.consentedAt === null && !row.consentByProxy) return "";

  const who = row.consentedByName ?? "";
  const base = row.consentByProxy ? (who ? `대행 · ${who}` : "대행") : who;
  return row.consentNote ? `${base} · ${row.consentNote}` : base;
}

/**
 * 비고 — 반려 사유와 취소 사유. 둘 다 한 칸에 담는다: 반려된 뒤 취소되는 일은
 * 없어 실제로는 한 쪽만 찬다. 학생 철회는 사유가 없어(`withdrawPass`)
 * 「취소」만 남는다 — 빈 칸으로 두면 취소된 사실 자체가 시트에서 사라진다.
 */
function remarkCell(row: PassHistoryExportRow): string {
  const parts: string[] = [];
  if (row.decisionNote) parts.push(`반려 사유 · ${row.decisionNote}`);
  if (row.status === "CANCELLED") {
    parts.push(row.cancelReason ? `취소 사유 · ${row.cancelReason}` : "취소");
  }
  return parts.join(" / ");
}

/** 열 너비(문자 단위). toPassHistorySheet의 머리글 순서와 하나씩 맞춘다. */
export const PASS_HISTORY_SHEET_WIDTHS: number[] = [
  8, // 유형
  12, // 상태
  6, // 학년
  6, // 반
  6, // 번호
  8, // 학번
  12, // 이름
  20, // 시작
  20, // 종료
  20, // 행선지
  32, // 사유 — 200자까지 들어온다. 이 시트에서 가장 넓은 열이다
  12, // 신청자
  20, // 보호자확인
  12, // 결재자
  20, // 결재시각
  32, // 비고
];

/** 접을 열. 넓혀도 한 줄에 안 들어가는 것들이다. */
export const PASS_HISTORY_SHEET_WRAP = [9, 10, 15]; // 행선지 · 사유 · 비고

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

/**
 * 시트 첫 줄에 적는 조회 범위. 파일 이름은 바뀌어도 이 줄은 남으므로,
 * 파일만 받은 사람도 어떤 조건으로 뽑은 것인지 알 수 있다.
 */
function historyScope(
  filter: PassHistoryExportInput,
  range: { since: Date; until: Date | null },
): string {
  const period = `${formatDateInput(range.since)} ~ ${
    // 상한이 열려 있으면 끝을 적지 않는다 — 오늘 날짜를 적으면 그날까지만
    // 뽑은 것으로 읽히는데 실제로는 앞으로 잡힌 신청까지 들어 있다.
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
      isPassStatus(row.status) ? PASS_STATUS_LABELS[row.status] : row.status,
      row.grade ?? "",
      row.classNo ?? "",
      row.number ?? "",
      // 학번은 「2305」처럼 앞자리가 뜻을 갖는 글자다. 반이 두 자리면 줄일 수
      // 없어 빈 칸이 되고, 그때는 왼쪽의 학년·반·번호 세 열이 답한다.
      formatStudentNumber(row) ?? "",
      row.studentName,
      startCell(row),
      endCell(row),
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
