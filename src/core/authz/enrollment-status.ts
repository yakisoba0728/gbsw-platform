/**
 * 학적 — 그 학년도의 상태다. 학생의 영구 속성이 아니라 Enrollment에 붙는다.
 *
 * 저장값은 영문 상수, 화면 표기는 라벨. role·status가 이미 이 방식이다.
 * 한글은 명단 엑셀의 열 표기일 뿐이라 파서가 라벨→상수로 옮긴다.
 */
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

/**
 * 재학이 아니면 로그인을 막는다. 졸업도 마찬가지다 —
 * 재학생만 쓰는 시스템이라 졸업생이 들어와도 볼 게 없고 관리 대상만 늘어난다.
 * 계정을 지우지는 않는다. 상벌점·감사로그가 남아야 한다.
 */
export function keepsAccountActive(status: EnrollmentStatus): boolean {
  return status === "ENROLLED";
}
