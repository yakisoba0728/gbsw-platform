import {
  ENROLLMENT_STATUS_LABELS,
  type EnrollmentStatus,
} from "@/core/authz/enrollment-status";

/**
 * 명단 파일의 머리글과 내보낼 행을 만드는 순수 함수.
 *
 * 열 이름을 여기 두는 이유: roster.parse.ts는 read-excel-file/node를 물고 있어
 * 서버 전용이다. 이 파일은 아무것도 물지 않아 브라우저(import-form.tsx)에서
 * 직접 값으로 가져다 쓸 수 있다 — 반대 방향(parse.ts가 export.ts를 가져감)으로
 * 정의해야 브라우저 번들에 read-excel-file/node가 새어들지 않는다.
 * roster.parse.ts는 여기서 ROSTER_COLUMNS를 가져간다.
 */

export const ROSTER_COLUMNS = [
  "학생코드",
  "이름",
  "생년월일",
  "학년",
  "반",
  "번호",
  "학적",
] as const;

/** 내보낼 때만 붙이는 참고 열. 올릴 때는 무시한다 — 사실은 그 학년도 배정이 정한다. */
export const ROSTER_INFO_COLUMNS = ["입학반", "입학번호"] as const;

/**
 * write-excel-file의 `columns` 옵션(열 너비, 문자 단위)에 그대로 쓴다.
 * ROSTER_COLUMNS + ROSTER_INFO_COLUMNS 순서와 하나씩 맞춘다.
 * 지어내지 않는다 — 값은 태스크 브리프가 정한 것 그대로다.
 */
export const ROSTER_COLUMN_WIDTHS: number[] = [
  12, // 학생코드
  10, // 이름
  12, // 생년월일
  6, // 학년
  6, // 반
  6, // 번호
  8, // 학적
  8, // 입학반 (참고)
  8, // 입학번호 (참고)
];

/**
 * 내보내기 대상 학생 한 명. roster.repo.ts의 listExisting()이 주는 모양의 부분집합이다 —
 * 새 타입을 강제하지 않고 필요한 필드만 구조 분해로 받는다.
 */
export type ExportStudent = {
  studentCode: string;
  name: string;
  /** YYYY-MM-DD */
  birthDate: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: string | null;
  entryClassNo: number | null;
  entryNumber: number | null;
};

/**
 * 내보낼 행렬을 만든다: 머리글 + 학생마다 한 줄.
 *
 * 머리글은 ROSTER_COLUMNS + ROSTER_INFO_COLUMNS 순서 그대로다 — 파서(roster.parse.ts의
 * normalizeRows)가 이름으로 열을 찾으므로 순서 자체는 파싱에 영향이 없지만, 사람이
 * 내려받아 다시 올리는 왕복에서 뒤섞이면 헷갈린다. 참고 열은 항상 마지막에 붙는다.
 *
 * 학적은 한글 라벨로 되돌린다 — 파서(STATUS_BY_LABEL)와 반대 방향의 변환이다.
 * 그 학년도 배정이 없는 학생(status === null, 학년도 막 넘어간 시점)은 학년·반·번호·
 * 학적을 전부 빈 칸으로 둔다 — 실제로 없는 값이니 지어내지 않는다.
 */
export function buildExportRows(
  students: ExportStudent[],
): (string | number | null)[][] {
  const header: (string | number | null)[] = [...ROSTER_COLUMNS, ...ROSTER_INFO_COLUMNS];

  const rows = students.map((s) => [
    s.studentCode,
    s.name,
    s.birthDate,
    s.grade,
    s.classNo,
    s.number,
    s.status ? ENROLLMENT_STATUS_LABELS[s.status as EnrollmentStatus] : "",
    s.entryClassNo,
    s.entryNumber,
  ]);

  return [header, ...rows];
}
