import {
  isYearScoped,
  MERIT_KIND_LABELS,
  MERIT_TRACK_LABELS,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { formatDate } from "@/lib/datetime";

/**
 * 엑셀 행렬을 만든다. **순수 함수** — 서버는 파일을 만들지 않고 행렬만 돌려주며,
 * 클라이언트가 write-excel-file/browser로 xlsx를 만든다 (명단 내보내기와 같은 방식).
 *
 * null을 절대 내보내지 않는다 — write-excel-file이 null 셀을 만나면 그 열의
 * 타입 추론이 흔들려 숫자 열이 문자열로 나가는 일이 생긴다. 빈 값은 "".
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
    // 무엇을 보고 있는지 시트 안에 적는다. 파일명은 옮겨 다니다 바뀌지만
    // 시트 첫 줄은 남는다 — 교내(그 학년도)와 기숙사(누적)는 같은 숫자가
    // 전혀 다른 뜻이라, 구분이 없으면 나중에 아무도 판별할 수 없다.
    [rosterScope(meta)],
    // 상쇄 열은 값이 0이어도 항상 낸다 — 상점 − 벌점이 순점수와 안 맞는 시트를
    // 받으면 받은 사람이 숫자를 못 믿는다. 순점수 = 상점 + 상쇄 − 벌점.
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
  createdAt: Date;
};

export function toHistorySheet(
  awards: HistoryRow[],
  meta: { track: MeritTrack; studentName: string },
): (string | number)[][] {
  return [
    [`${meta.studentName} · ${MERIT_TRACK_LABELS[meta.track]} 상벌점`],
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
