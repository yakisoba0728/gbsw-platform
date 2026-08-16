import { MERIT_KIND_LABELS, type MeritKind, type MeritTrack } from "@/core/authz/merit-track";
import { formatDate } from "@/lib/datetime";

/**
 * 엑셀 행렬을 만든다. **순수 함수** — 서버는 파일을 만들지 않고 행렬만 돌려주며,
 * 클라이언트가 write-excel-file/browser로 xlsx를 만든다 (명단 내보내기와 같은 방식).
 *
 * null을 절대 내보내지 않는다 — write-excel-file이 null 셀을 만나면 그 열의
 * 타입 추론이 흔들려 숫자 열이 문자열로 나가는 일이 생긴다. 빈 값은 "".
 */

export type RosterRow = {
  studentProfileId: string;
  studentCode: string;
  name: string;
  number: number | null;
  merit: number;
  demerit: number;
  net: number;
};

export function toRosterSheet(
  rows: RosterRow[],
  _meta: { track: MeritTrack; year: number; grade: number; classNo: number },
): (string | number)[][] {
  return [
    ["번호", "이름", "학생코드", "상점", "벌점", "순점수"],
    ...rows.map((r) => [
      r.number ?? "",
      r.name,
      r.studentCode,
      r.merit,
      r.demerit,
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
  createdAt: Date;
};

export function toHistorySheet(
  awards: HistoryRow[],
  _meta: { track: MeritTrack; studentName: string },
): (string | number)[][] {
  return [
    ["학년도", "날짜", "구분", "항목", "점수", "메모", "부여자", "상태", "취소사유"],
    ...awards.map((a) => [
      a.year,
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
