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
