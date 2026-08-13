import { z } from "zod";
import { ENROLLMENT_STATUSES } from "@/core/authz/enrollment-status";
import { MAX_YEAR, MIN_YEAR } from "@/modules/academic-year/academic-year.schema";

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
  // 렌더 시점의 현재 학년도. 저장 시점에 다시 확인해 그 사이 학년도가
  // 바뀌었으면 거부한다 (다른 관리자가 탭을 열어둔 채로 넘길 수 있다).
  year: z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR),
});

export type EnrollmentChange = z.infer<typeof enrollmentChangeSchema>;
