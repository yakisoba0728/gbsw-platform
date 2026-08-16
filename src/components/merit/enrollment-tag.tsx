import { Badge } from "@/components/ui/badge";
import {
  ENROLLMENT_STATUS_LABELS,
  isEnrollmentStatus,
} from "@/core/authz/enrollment-status";

/**
 * 학적 표시 — **재학이 아닐 때만 나온다.**
 *
 * 상벌점을 줄 상대를 고르는 자리(검색 결과·학생 머리글)에 붙인다. 졸업생·자퇴생
 * 이름이 재학생과 똑같이 보이면 동명이인을 고를 때 알아챌 방법이 없고, 부여
 * 자체는 학적을 안 보므로(award.service) 시스템이 막아 주지도 않는다.
 *
 * 재학(`ENROLLED`)에는 아무것도 안 붙인다. 거의 전부가 재학이라 붙이면 표시가
 * 아니라 배경이 된다 — 눈에 띄어야 할 소수가 오히려 묻힌다.
 *
 * `null`은 "그 학년도 재적 줄이 아예 없다"는 뜻이라 학적이라 부를 것이 없다.
 * 소속 칸이 이미 미배정으로 그 사실을 말한다.
 */
export function EnrollmentTag({ status }: { status: string | null }) {
  if (!isEnrollmentStatus(status) || status === "ENROLLED") return null;

  // 주의를 끄는 자리라 호박색을 쓴다. 점은 끈다 — 상태의 진행 중을 뜻하는
  // 표시(pending)가 아니라 사실을 적는 꼬리표다.
  return (
    <Badge tone="pending" dot={false}>
      {ENROLLMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
