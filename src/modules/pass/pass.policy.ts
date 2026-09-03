import type { PassStatus } from "@/core/authz/pass-type";

/* 출입증 도메인 정책. PassType·PassStatus 같은 공용 어휘는 core 커널에 남기고,
   상태를 어떻게 다룰지는 이 모듈이 소유한다 — core가 외출증 규칙을 알지 못하게. */

/** 보호자 확인이 필요한 유형(외박)인지 판정한다. */
export function requiresConsent(type: string): boolean {
  return type === "OVERNIGHT";
}

/** 교사가 승인·반려를 결정할 수 있는 상태. */
export const DECIDABLE_STATUSES: readonly PassStatus[] = ["REQUESTED", "CONSENTED"];

/** 아직 흘러가는 중인 상태 — 겹침 검사·대시보드·정문 판정의 기준 집합. */
export const LIVE_STATUSES: readonly PassStatus[] = [
  "REQUESTED",
  "CONSENTED",
  "APPROVED",
];

/** 승인됐고 아직 끝나지 않은 건은 취소할 수 있다. */
export function isRevocable(status: string, endAt: Date, now: Date): boolean {
  return status === "APPROVED" && endAt.getTime() > now.getTime();
}
