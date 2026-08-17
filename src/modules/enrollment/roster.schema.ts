import { z } from "zod";
import { ENROLLMENT_STATUSES } from "@/core/authz/enrollment-status";
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

/**
 * 확정 반영 경계에서 검증한다 (I3).
 *
 * applyRosterAction은 클라이언트가 미리보기 때 받은 RosterRow[]를 그대로 돌려받아
 * JSON.parse만 하고 서비스로 넘겼었다 — "zod 검증은 경계에서 한 번만"에 어긋난다.
 * 특히 `errors: []`로 지워 보내면 파서가 잡은 오류를 우회할 수 있었다: status가
 * ENROLLED인데 학년·반·번호가 전부 null인 줄도 그대로 저장됐다. 아래 refine이
 * 그 불변식(재학이면 자리가 있어야 한다)을 서버가 다시 확인한다.
 *
 * grade/classNo/number 범위는 enrollment.schema.ts의 상수를 그대로 쓴다 — 파서
 * (roster.parse.ts의 normalizeRows)가 미리보기에서 잡는 규칙과 이 경계가 어긋나면,
 * 미리보기를 통과한 뒤 이 값만 손봐서 보낸 요청이 여기서는 오히려 통과해버린다.
 */
const rosterRowSchema = z
  .object({
    line: z.number().int(),
    // 빈 문자열이면 신규 학생이다. 머리글에 학생코드 열이 없는 파일도 받으므로
    // 필수이되(파서가 항상 채워 보낸다) 빈 값 자체는 정상이다.
    studentCode: z.string(),
    name: z.string(),
    birthDate: z.string(),
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
    errors: z.array(z.string()),
  })
  .refine(
    (row) =>
      row.status !== "ENROLLED" ||
      (row.grade !== null && row.classNo !== null && row.number !== null),
    { message: "재학이면 학년·반·번호가 모두 있어야 합니다." },
  )
  .refine((row) => row.studentCode === "" || isStudentCode(row.studentCode), {
    message: "학생코드 형식이 올바르지 않습니다.",
  });

/**
 * 행 수 상한. 전교생 규모(수백 명)를 훌쩍 넘는다 — 정상 사용에서 닿지 않는다.
 * applyRosterAction의 rows는 파일 업로드가 아니라 폼 필드(JSON 문자열)라 미리보기의
 * MAX_BYTES 파일 크기 제한을 거치지 않는다. 이 상한이 그 경로의 유일한 크기 방어다.
 */
export const rosterRowsSchema = z
  .array(rosterRowSchema)
  .min(1, "반영할 내용이 없습니다.")
  .max(2000, "한 번에 2000행까지 반영할 수 있습니다.");

/**
 * 미리보기가 준 삭제 대상(missingFromFile)의 studentProfileId 목록 (I-2).
 *
 * 확정 시점에 서비스가 다시 세운 삭제 대상 집합과 이 목록을 대조한다 — 미리보기
 * 이후 DB가 바뀌면(예: 파일에 줄이 없던 학생이 그 사이 가입해 새 StudentProfile이
 * 생기면) 관리자가 본 적 없는 학생이 조용히 삭제 대상에 섞여 들어갈 수 있다.
 *
 * **동의 표시가 아니라 화면이 본 목록이다.** 관리자의 동의는 아래 건수 입력이
 * 받는다 — 화면은 미리보기에 삭제 대상이 있으면 이 목록을 늘 그대로 실어 보낸다.
 * 그래서 삭제 대상이 있는데 빈 배열이 오면 화면을 거치지 않은 요청이라는 뜻이고,
 * 서비스의 집합 대조가 그것도 함께 거른다.
 */
export const confirmedDeletionIdsSchema = z.array(z.string().min(1)).max(2000);

/**
 * 삭제 인원 확인 입력(I-3). `formData.get()`이 돌려주는 문자열 그대로 받는다 —
 * 삭제 대상이 하나도 없는 반영에서는 화면에 입력칸 자체가 없으므로 빈 문자열
 * ("입력 안 함")이 정상이고, 그때는 null로 접는다. 삭제 대상이 있는데 null이면
 * 서비스가 DELETION_COUNT_MISMATCH로 거부한다 — 그 판단은 여기서 하지 않는다.
 * 삭제 건수는 이 경계가 아니라 서버가 다시 세운 plan만 알기 때문이다.
 */
export const deletionCountConfirmationSchema = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}, z.coerce.number().int().min(0).nullable());
