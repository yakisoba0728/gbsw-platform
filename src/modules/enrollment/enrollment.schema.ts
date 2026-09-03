import { z } from "zod";
import { ENROLLMENT_STATUSES } from "@/core/authz/enrollment-status";
import { MAX_YEAR, MIN_YEAR } from "@/modules/academic-year/academic-year.schema";
import {
  CLASS_NO_RANGE_MESSAGE,
  GRADE_RANGE_MESSAGE,
  MAX_CLASS_NO,
  MAX_GRADE,
  MAX_NUMBER,
  MIN_CLASS_NO,
  MIN_GRADE,
  MIN_NUMBER,
  NUMBER_RANGE_MESSAGE,
} from "@/modules/student/student-position";

export const enrollmentChangeSchema = z.object({
  studentProfileId: z.string().min(1),
  expectedUpdatedAt: z
    .union([z.iso.datetime(), z.null()])
    .transform((value) => (value === null ? null : new Date(value))),
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
  year: z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR),
});

export type EnrollmentChange = z.infer<typeof enrollmentChangeSchema>;
