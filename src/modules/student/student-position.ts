// 학적·초대·통계가 공유하는 학생 배치(학년·반·번호) 규칙이다.
export const MIN_GRADE = 1;
export const MAX_GRADE = 3;
export const MIN_CLASS_NO = 1;
export const MAX_CLASS_NO = 20;
export const MIN_NUMBER = 1;
export const MAX_NUMBER = 50;

export const GRADE_RANGE_MESSAGE =
  `학년은 ${MIN_GRADE}~${MAX_GRADE}이어야 합니다.`;
export const CLASS_NO_RANGE_MESSAGE =
  `반은 ${MIN_CLASS_NO}~${MAX_CLASS_NO}이어야 합니다.`;
export const NUMBER_RANGE_MESSAGE =
  `번호는 ${MIN_NUMBER}~${MAX_NUMBER}이어야 합니다.`;

export class NumberTakenError extends Error {}
