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

export function requiresConsent(type: string): boolean {
  return type === "OVERNIGHT";
}

export const DECIDABLE_STATUSES: readonly PassStatus[] = ["REQUESTED", "CONSENTED"];

export const LIVE_STATUSES: readonly PassStatus[] = [
  "REQUESTED",
  "CONSENTED",
  "APPROVED",
];

export function isRevocable(status: string, endAt: Date, now: Date): boolean {
  return status === "APPROVED" && endAt.getTime() > now.getTime();
}
