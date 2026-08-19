import type { EnrollmentStatus } from "@/core/authz/enrollment-status";
import type { StudentRow } from "./student-table";

export type Draft = {
  grade: string;
  classNo: string;
  number: string;
  status: EnrollmentStatus;
};

export function toDraft(row: StudentRow): Draft {
  return {
    grade: row.grade == null ? "" : String(row.grade),
    classNo: row.classNo == null ? "" : String(row.classNo),
    number: row.number == null ? "" : String(row.number),
    // 배정이 없는 학생은 재학으로 시작한다 — 이 화면에서 채우는 게 보통이다.
    status: (row.status as EnrollmentStatus) ?? "ENROLLED",
  };
}

export function sameAsRow(row: StudentRow, d: Draft): boolean {
  return (
    d.grade === (row.grade == null ? "" : String(row.grade)) &&
    d.classNo === (row.classNo == null ? "" : String(row.classNo)) &&
    d.number === (row.number == null ? "" : String(row.number)) &&
    d.status === ((row.status as EnrollmentStatus) ?? "ENROLLED")
  );
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.grade === b.grade &&
    a.classNo === b.classNo &&
    a.number === b.number &&
    a.status === b.status
  );
}

/**
 * 관리자가 실제로 건드린 필드만 override로 들고 있다. 나머지는 늘 최신 rows에서
 * 읽으므로 저장 뒤 새로 내려온 값이 그대로 보인다.
 */
export function draftFor(
  row: StudentRow,
  overrides: Record<string, Partial<Draft>>,
): Draft {
  return { ...toDraft(row), ...overrides[row.studentProfileId] };
}

export function clearUnchangedSubmittedDrafts(
  rows: StudentRow[],
  drafts: Record<string, Partial<Draft>>,
  submittedDrafts: Record<string, Draft>,
): Record<string, Partial<Draft>> {
  const next = { ...drafts };
  const rowsById = new Map(rows.map((row) => [row.studentProfileId, row]));

  for (const [id, submitted] of Object.entries(submittedDrafts)) {
    const row = rowsById.get(id);
    if (!row || sameDraft(draftFor(row, drafts), submitted)) delete next[id];
  }

  return next;
}
