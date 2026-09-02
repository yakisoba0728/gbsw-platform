import {
  ENROLLMENT_STATUS_LABELS,
  type EnrollmentStatus,
} from "@/core/authz/enrollment-status";

export const ROSTER_COLUMNS = [
  "학생코드",
  "이름",
  "생년월일",
  "학년",
  "반",
  "번호",
  "학적",
] as const;

export const ROSTER_INFO_COLUMNS = ["입학반", "입학번호"] as const;

export const ROSTER_COLUMN_WIDTHS: number[] = [
  12,
  10,
  12,
  6,
  6,
  6,
  8,
  8,
  8,
];

export type ExportStudent = {
  studentCode: string;
  name: string;
  birthDate: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: string | null;
  entryClassNo: number | null;
  entryNumber: number | null;
};

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
