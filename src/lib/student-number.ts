/**
 * 학번 — 학년·반·번호를 붙여 쓴 4자리(`2305` = 2학년 3반 5번).
 *
 * **식별자가 아니다.** 해마다 바뀌므로 기록은 `studentCode`에 매단다
 * (src/lib/student-code.ts). 학번은 교사가 외우고 있는 값이라 검색 입력으로만 쓴다.
 *
 * 번호는 두 자리로 고정한다 — 3자리를 허용하면 `2305`가 "2학년 3반 5번"인지
 * "2학년 30반 5번"인지 갈리고, 어느 쪽으로 읽어도 조용히 남의 학생이 나온다.
 */
export type StudentNumber = { grade: number; classNo: number; number: number };

/**
 * 학번 문자열. 반이 두 자리이거나 번호가 세 자리면 null이다 — `2305`가
 * "2학년 3반 5번"인지 "2학년 30반 5번"인지 갈리는 그 경우다. 호출부는 이때
 * "2-30 5"처럼 자리를 나눠 쓰는 원래 표기로 떨어진다.
 *
 * 배정이 없는 학생(grade·classNo·number 중 하나라도 null)도 null이다.
 * 학번은 올해 어디에 앉아 있는지를 적는 값이라 배정이 없으면 존재하지 않는다.
 */
export function formatStudentNumber(seat: {
  grade: number | null;
  classNo: number | null;
  number: number | null;
}): string | null {
  const { grade, classNo, number } = seat;
  if (grade === null || classNo === null || number === null) return null;
  if (grade < 1 || grade > 9) return null;
  if (classNo < 1 || classNo > 9) return null;
  if (number < 1 || number > 99) return null;

  return `${grade}${classNo}${String(number).padStart(2, "0")}`;
}

/**
 * 목록·표에 적을 자리 표기. 학번으로 줄일 수 있으면 학번(`1307`), 반이 두 자리라
 * 줄일 수 없으면 자리를 나눠 적는다(`2-30 5`). 배정이 없으면 null이다 — 그 자리에
 * 무슨 말을 넣을지는 화면마다 달라서(「미배정」·「소속 미배정」·「반 미배정」)
 * 부르는 쪽이 고른다.
 *
 * 학생 상세 머리글과 인쇄물은 이것을 쓰지 않는다 — 거기서는 「1학년 3반 7번」이
 * 읽기 좋고, 인쇄물은 학교 밖으로 나가는 문서다.
 */
export function formatSeat(seat: {
  grade: number | null;
  classNo: number | null;
  number: number | null;
}): string | null {
  const short = formatStudentNumber(seat);
  if (short) return short;

  const { grade, classNo, number } = seat;
  if (grade === null || classNo === null) return null;
  return number === null ? `${grade}-${classNo}` : `${grade}-${classNo} ${number}`;
}

/** 학번이 아니면 null. 호출부는 이때 이름·학생코드 검색으로 떨어진다. */
export function parseStudentNumber(value: string): StudentNumber | null {
  const trimmed = value.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;

  const grade = Number(trimmed[0]);
  const classNo = Number(trimmed[1]);
  const number = Number(trimmed.slice(2));

  // 0학년·0반·0번은 없다. 상한은 두지 않는다 — 학교가 반을 늘리면 코드가 아니라
  // 명단이 먼저 바뀌고, 없는 반을 물으면 결과가 비어 나올 뿐이다.
  if (grade === 0 || classNo === 0 || number === 0) return null;

  return { grade, classNo, number };
}
