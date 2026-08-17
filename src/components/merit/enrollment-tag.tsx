import { Badge } from "@/components/ui/badge";
import {
  ENROLLMENT_STATUS_LABELS,
  isEnrollmentStatus,
} from "@/core/authz/enrollment-status";

/**
 * 학적 표시 — 재학이 아닐 때만 나온다. 부여는 학적을 보지 않으므로, 이 꼬리표가
 * 없으면 졸업생·자퇴생을 동명이인으로 잘못 고를 때 알아챌 방법이 없다.
 */
export function EnrollmentTag({ status }: { status: string | null }) {
  if (!isEnrollmentStatus(status) || status === "ENROLLED") return null;

  // 점은 끈다 — 진행 중(pending)이 아니라 사실을 적는 꼬리표다.
  return (
    <Badge tone="pending" dot={false}>
      {ENROLLMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
