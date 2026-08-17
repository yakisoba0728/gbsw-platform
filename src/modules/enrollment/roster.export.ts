import {
  ENROLLMENT_STATUS_LABELS,
  type EnrollmentStatus,
} from "@/core/authz/enrollment-status";

/**
 * 명단 파일의 머리글과 내보낼 행. 아무 의존성도 없어 브라우저에서 그대로 쓴다 —
 * 열 이름이 서버 전용인 roster.parse.ts에 있으면 브라우저 번들이 그걸 끌고 온다.
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

/** 내보낼 때만 붙이는 참고 열. 올릴 때는 무시한다. */
export const ROSTER_INFO_COLUMNS = ["입학반", "입학번호"] as const;

/** 열 너비(문자 단위). ROSTER_COLUMNS + ROSTER_INFO_COLUMNS 순서와 하나씩 맞춘다. */
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

/** 내보내기 대상 학생 한 명. listExisting()이 주는 모양의 부분집합이다. */
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
 * 내보낼 행렬: 머리글 + 학생마다 한 줄. 참고 열은 항상 마지막에 붙는다.
 * 그 학년도 배정이 없는 학생은 학년·반·번호·학적이 전부 빈 칸이다.
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
