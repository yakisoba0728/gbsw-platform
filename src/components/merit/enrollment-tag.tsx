import { Badge } from "@/components/ui/badge";
import {
  ENROLLMENT_STATUS_LABELS,
  isEnrollmentStatus,
} from "@/core/authz/enrollment-status";

/**
 * 학적 표시 — 재학이 아닐 때만 나온다. **재학이 아니면 상벌점을 줄 수 없고**,
 * 이 꼬리표가 그 사실이 화면에 서는 자리다. 없으면 졸업생·자퇴생을 동명이인으로
 * 잘못 골랐을 때도, 부여 폼이 사라진 이유도 알아챌 방법이 없다.
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
