/** 학적은 학생의 영구 속성이 아니라 그 학년도 Enrollment에 붙는 상태다. */
export const ENROLLMENT_STATUSES = [
  "ENROLLED",
  "GRADUATED",
  "WITHDRAWN",
  "EXPELLED",
  "TRANSFERRED",
  "DEFERRED",
] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  ENROLLED: "재학",
  GRADUATED: "졸업",
  WITHDRAWN: "자퇴",
  EXPELLED: "퇴학",
  TRANSFERRED: "전출",
  DEFERRED: "유예",
};

export function isEnrollmentStatus(value: unknown): value is EnrollmentStatus {
  return (
    typeof value === "string" &&
    (ENROLLMENT_STATUSES as readonly string[]).includes(value)
  );
}

/** 재학이 아니면 로그인을 막는다 (졸업 포함). 계정을 지우지는 않는다. */
export function keepsAccountActive(status: EnrollmentStatus): boolean {
  return status === "ENROLLED";
}
