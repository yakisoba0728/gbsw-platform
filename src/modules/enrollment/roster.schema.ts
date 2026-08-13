import { z } from "zod";
import { ENROLLMENT_STATUSES } from "@/core/authz/enrollment-status";

/**
 * 확정 반영 경계에서 검증한다 (I3).
 *
 * applyRosterAction은 클라이언트가 미리보기 때 받은 RosterRow[]를 그대로 돌려받아
 * JSON.parse만 하고 서비스로 넘겼었다 — "zod 검증은 경계에서 한 번만"에 어긋난다.
 * 특히 `errors: []`로 지워 보내면 파서가 잡은 오류를 우회할 수 있었다: status가
 * ENROLLED인데 학년·반·번호가 전부 null인 줄도 그대로 저장됐다. 아래 refine이
 * 그 불변식(재학이면 자리가 있어야 한다)을 서버가 다시 확인한다.
 *
 * grade/classNo/number에 별도 범위를 두지 않는다 — 그건 이 파일 업로드 기능이
 * 원래 갖고 있던 검증 범위 밖이라 여기서 새로 만들지 않는다.
 */
const rosterRowSchema = z
  .object({
    line: z.number().int(),
    name: z.string(),
    birthDate: z.string(),
    grade: z.number().int().nullable(),
    classNo: z.number().int().nullable(),
    number: z.number().int().nullable(),
    status: z.enum(ENROLLMENT_STATUSES).nullable(),
    errors: z.array(z.string()),
  })
  .refine(
    (row) =>
      row.status !== "ENROLLED" ||
      (row.grade !== null && row.classNo !== null && row.number !== null),
    { message: "재학이면 학년·반·번호가 모두 있어야 합니다." },
  );

/**
 * 행 수 상한. 전교생 규모(수백 명)를 훌쩍 넘는다 — 정상 사용에서 닿지 않는다.
 * applyRosterAction의 rows는 파일 업로드가 아니라 폼 필드(JSON 문자열)라 미리보기의
 * MAX_BYTES 파일 크기 제한을 거치지 않는다. 이 상한이 그 경로의 유일한 크기 방어다.
 */
export const rosterRowsSchema = z
  .array(rosterRowSchema)
  .min(1, "반영할 내용이 없습니다.")
  .max(2000, "한 번에 2000행까지 반영할 수 있습니다.");
