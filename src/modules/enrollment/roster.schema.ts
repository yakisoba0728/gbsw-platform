import { z } from "zod";
import { ENROLLMENT_STATUSES } from "@/core/authz/enrollment-status";
import { canonicalDateInputSchema } from "@/lib/date-input";
import { isStudentCode } from "@/modules/enrollment/student-code";
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

const nameSchema = z
  .string()
  .transform((value) => value.trim().normalize("NFC"))
  .pipe(z.string().min(1, "이름이 비어 있습니다."));

const birthDateSchema = canonicalDateInputSchema(
  "생년월일을 읽을 수 없습니다.",
  "생년월일을 읽을 수 없습니다.",
);

export const ROSTER_FILE_MAX_BYTES = 5 * 1024 * 1024;

export const MAX_ROSTER_ROWS = 2000;

const rosterRowSchema = z
  .object({
    line: z.number().int(),
    studentCode: z.string(),
    name: nameSchema,
    birthDate: birthDateSchema,
    grade: z
      .number()
      .int()
      .min(MIN_GRADE, GRADE_RANGE_MESSAGE)
      .max(MAX_GRADE, GRADE_RANGE_MESSAGE)
      .nullable(),
    classNo: z
      .number()
      .int()
      .min(MIN_CLASS_NO, CLASS_NO_RANGE_MESSAGE)
      .max(MAX_CLASS_NO, CLASS_NO_RANGE_MESSAGE)
      .nullable(),
    number: z
      .number()
      .int()
      .min(MIN_NUMBER, NUMBER_RANGE_MESSAGE)
      .max(MAX_NUMBER, NUMBER_RANGE_MESSAGE)
      .nullable(),
    status: z.enum(ENROLLMENT_STATUSES).nullable(),
    errors: z.unknown().transform((): string[] => []),
  })
  .refine(
    (row) =>
      row.status !== "ENROLLED" ||
      (row.grade !== null && row.classNo !== null && row.number !== null),
    { message: "재학이면 학년·반·번호가 모두 있어야 합니다." },
  )
  .refine((row) => row.studentCode === "" || isStudentCode(row.studentCode), {
    message: "학생코드 형식이 올바르지 않습니다.",
  })
  .transform((row) => ({
    ...row,
    grade: row.status === "ENROLLED" ? row.grade : null,
    classNo: row.status === "ENROLLED" ? row.classNo : null,
    number: row.status === "ENROLLED" ? row.number : null,
  }));

export const rosterRowsSchema = z
  .array(rosterRowSchema)
  .min(1, "반영할 내용이 없습니다.")
  .max(
    MAX_ROSTER_ROWS,
    `한 번에 ${MAX_ROSTER_ROWS}줄까지 반영할 수 있습니다.`,
  );

export const confirmedDeletionIdsSchema = z.array(z.string().min(1)).max(2000);

export const rosterFingerprintSchema = z
  .string("미리보기 정보가 없습니다. 파일을 다시 읽어 주세요.")
  .trim()
  .min(1, "미리보기 정보가 없습니다. 파일을 다시 읽어 주세요.");

export const deletionCountConfirmationSchema = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}, z.coerce.number().int().min(0).nullable());
