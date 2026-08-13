import { z } from "zod";
import { ENROLLMENT_STATUSES } from "@/core/authz/enrollment-status";

/**
 * 표에서 고친 줄들. 바뀌지 않은 줄이 섞여 와도 되며, 서비스가 걸러낸다.
 *
 * 반·번호가 null인 것은 "재학이 아니라 비운다"는 뜻이다.
 * 재학인데 비어 있으면 서비스가 거부한다 — 그건 업무 규칙이라 여기서 보지 않는다.
 */
export const enrollmentChangeSchema = z.object({
  studentProfileId: z.string().min(1),
  grade: z.coerce.number().int().min(1).max(3).nullable(),
  classNo: z.coerce.number().int().min(1).max(20).nullable(),
  number: z.coerce.number().int().min(1).max(50).nullable(),
  status: z.enum(ENROLLMENT_STATUSES),
});

export const saveEnrollmentsSchema = z.object({
  changes: z.array(enrollmentChangeSchema).min(1, "바뀐 내용이 없습니다.").max(500),
});

export type EnrollmentChange = z.infer<typeof enrollmentChangeSchema>;
