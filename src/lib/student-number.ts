type StudentNumber = { grade: number; classNo: number; number: number };
type StudentSeat = { grade: number | null; classNo: number | null; number: number | null };

export function formatStudentNumber(seat: StudentSeat): string | null {
  const { grade, classNo, number } = seat;
  if (grade === null || classNo === null || number === null) return null;
  if (grade < 1 || grade > 9) return null;
  if (classNo < 1 || classNo > 9) return null;
  if (number < 1 || number > 99) return null;

  return `${grade}${classNo}${String(number).padStart(2, "0")}`;
}

export function formatSeat(seat: StudentSeat): string | null {
  const short = formatStudentNumber(seat);
  if (short) return short;

  const { grade, classNo, number } = seat;
  if (grade === null || classNo === null) return null;
  return number === null ? `${grade}-${classNo}` : `${grade}-${classNo} ${number}`;
}

export function parseStudentNumber(value: string): StudentNumber | null {
  const trimmed = value.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;

  const grade = Number(trimmed[0]);
  const classNo = Number(trimmed[1]);
  const number = Number(trimmed.slice(2));

  if (grade === 0 || classNo === 0 || number === 0) return null;

  return { grade, classNo, number };
}
