import { z } from "zod";
import { ENROLLMENT_STATUSES } from "@/core/authz/enrollment-status";
import { canonicalDateInputSchema } from "@/lib/date-input";
import { isStudentCode } from "@/lib/student-code";
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
} from "@/modules/enrollment/enrollment.schema";

const nameSchema = z
  .string()
  .transform((value) => value.trim().normalize("NFC"))
  .pipe(z.string().min(1, "이름이 비어 있습니다."));

const birthDateSchema = canonicalDateInputSchema(
  "생년월일을 읽을 수 없습니다.",
  "생년월일을 읽을 수 없습니다.",
);

/**
 * 명단 파일 크기 상한. 전교생 300명이면 수십 KB면 충분하다.
 *
 * next.config.ts의 `experimental.serverActions.bodySizeLimit`("6mb")보다 작아야 한다 —
 * 그 값을 넘는 요청은 서버 액션에 닿기도 전에 잘려 안내 대신 오류 경계가 뜬다.
 * 남는 1MiB는 multipart 경계·part 머리글 몫이다. 액션과 화면이 같은 값을 봐야
 * 안내 없는 구간이 생기지 않아 여기 한 곳에 둔다.
 */
export const ROSTER_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** 파일 미리보기와 확정이 한 번에 받는 학생 행 수. */
export const MAX_ROSTER_ROWS = 2000;

/**
 * 확정 반영 경계. 미리보기가 돌려준 행을 그대로 믿지 않는다 — errors를 지워
 * 보내도 아래 refine이 "재학이면 자리가 있어야 한다"를 다시 확인한다.
 * 범위 상수는 파서와 같은 곳에서 가져와야 어긋나지 않는다.
 */
const rosterRowSchema = z
  .object({
    line: z.number().int(),
    // 빈 문자열이면 신규 학생이다. 파서가 항상 채워 보내므로 필수로 둔다.
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

/**
 * 행 수 상한. 확정 경로의 rows는 폼 필드라 미리보기의 파일 크기 제한을 거치지
 * 않는다 — 이 상한이 그 경로의 유일한 크기 방어다.
 */
export const rosterRowsSchema = z
  .array(rosterRowSchema)
  .min(1, "반영할 내용이 없습니다.")
  .max(
    MAX_ROSTER_ROWS,
    `한 번에 ${MAX_ROSTER_ROWS}줄까지 반영할 수 있습니다.`,
  );

/**
 * 미리보기가 보여준 삭제 대상 목록. 동의 표시가 아니라 "화면이 무엇을 보고
 * 있었는가"이며, 서비스가 확정 시점에 다시 세운 집합과 대조한다.
 * 파일 행 수와 다른 수량이라 MAX_ROSTER_ROWS와 의도적으로 묶지 않는다.
 */
export const confirmedDeletionIdsSchema = z.array(z.string().min(1)).max(2000);

export const rosterFingerprintSchema = z
  .string("미리보기 정보가 없습니다. 파일을 다시 읽어 주세요.")
  .trim()
  .min(1, "미리보기 정보가 없습니다. 파일을 다시 읽어 주세요.");

/**
 * 교사가 적은 삭제 인원. 입력칸이 없는 반영에서는 빈 문자열이 정상이라
 * null로 접는다 — 그때 거부할지는 plan을 아는 서비스가 정한다.
 */
export const deletionCountConfirmationSchema = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}, z.coerce.number().int().min(0).nullable());
