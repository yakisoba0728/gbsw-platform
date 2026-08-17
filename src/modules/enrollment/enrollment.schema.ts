import { z } from "zod";
import { ENROLLMENT_STATUSES } from "@/core/authz/enrollment-status";
import { MAX_YEAR, MIN_YEAR } from "@/modules/academic-year/academic-year.schema";

/**
 * 학년·반·번호의 범위. 표 편집과 명단 반영이 같은 테이블에 쓰므로 여기 한 번만
 * 정의한다 — 각자 박아두면 반이 20개를 넘는 날 한 곳만 고쳐진다.
 */
export const MIN_GRADE = 1;
export const MAX_GRADE = 3;
export const MIN_CLASS_NO = 1;
export const MAX_CLASS_NO = 20;
export const MIN_NUMBER = 1;
export const MAX_NUMBER = 50;

export const GRADE_RANGE_MESSAGE = `학년은 ${MIN_GRADE}~${MAX_GRADE}이어야 합니다.`;
export const CLASS_NO_RANGE_MESSAGE = `반은 ${MIN_CLASS_NO}~${MAX_CLASS_NO}이어야 합니다.`;
export const NUMBER_RANGE_MESSAGE = `번호는 ${MIN_NUMBER}~${MAX_NUMBER}이어야 합니다.`;

/**
 * 표에서 고친 줄들. 안 바뀐 줄이 섞여 와도 서비스가 걸러낸다.
 * 반·번호가 null이면 "재학이 아니라 비운다"는 뜻이다.
 */
export const enrollmentChangeSchema = z.object({
  studentProfileId: z.string().min(1),
  grade: z.coerce
    .number()
    .int()
    .min(MIN_GRADE, GRADE_RANGE_MESSAGE)
    .max(MAX_GRADE, GRADE_RANGE_MESSAGE)
    .nullable(),
  classNo: z.coerce
    .number()
    .int()
    .min(MIN_CLASS_NO, CLASS_NO_RANGE_MESSAGE)
    .max(MAX_CLASS_NO, CLASS_NO_RANGE_MESSAGE)
    .nullable(),
  number: z.coerce
    .number()
    .int()
    .min(MIN_NUMBER, NUMBER_RANGE_MESSAGE)
    .max(MAX_NUMBER, NUMBER_RANGE_MESSAGE)
    .nullable(),
  status: z.enum(ENROLLMENT_STATUSES),
});

export const saveEnrollmentsSchema = z.object({
  changes: z.array(enrollmentChangeSchema).min(1, "바뀐 내용이 없습니다.").max(500),
  // 화면이 그린 시점의 학년도. 저장 시점에 바뀌었으면 서비스가 거부한다.
  year: z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR),
});

export type EnrollmentChange = z.infer<typeof enrollmentChangeSchema>;
