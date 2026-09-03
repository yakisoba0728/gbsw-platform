export const PASS_TYPES = ["OUTING", "OVERNIGHT"] as const;

export type PassType = (typeof PASS_TYPES)[number];

export const PASS_TYPE_LABELS: Record<PassType, string> = {
  OUTING: "외출",
  OVERNIGHT: "외박",
};

export function isPassType(value: unknown): value is PassType {
  return typeof value === "string" && (PASS_TYPES as readonly string[]).includes(value);
}

export const PASS_STATUSES = [
  "REQUESTED",
  "CONSENTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export type PassStatus = (typeof PASS_STATUSES)[number];

export const PASS_STATUS_LABELS: Record<PassStatus, string> = {
  REQUESTED: "보호자 확인/승인 대기",
  CONSENTED: "교사 승인 대기",
  APPROVED: "승인됨",
  REJECTED: "반려됨",
  CANCELLED: "취소됨",
};

export function isPassStatus(value: unknown): value is PassStatus {
  return typeof value === "string" && (PASS_STATUSES as readonly string[]).includes(value);
}

/* 출입증 도메인 정책(requiresConsent·DECIDABLE_STATUSES·LIVE_STATUSES·isRevocable)은
   모듈이 소유한다 — src/modules/pass/pass.policy.ts */
