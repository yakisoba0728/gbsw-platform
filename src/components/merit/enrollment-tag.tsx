import { Badge } from "@/components/ui/badge";
import {
  ENROLLMENT_STATUS_LABELS,
  isEnrollmentStatus,
} from "@/core/authz/enrollment-status";

export function EnrollmentTag({ status }: { status: string | null }) {
  if (!isEnrollmentStatus(status) || status === "ENROLLED") return null;

  return (
    <Badge tone="pending" dot={false}>
      {ENROLLMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
