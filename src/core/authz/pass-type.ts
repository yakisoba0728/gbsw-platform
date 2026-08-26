/** 출입증 유형. Prisma의 Pass.type과 일치해야 한다. */
export const PASS_TYPES = ["OUTING", "OVERNIGHT"] as const;

export type PassType = (typeof PASS_TYPES)[number];

export const PASS_TYPE_LABELS: Record<PassType, string> = {
  OUTING: "외출",
  OVERNIGHT: "외박",
};

export function isPassType(value: unknown): value is PassType {
  return typeof value === "string" && (PASS_TYPES as readonly string[]).includes(value);
}

/**
 * 출입증 상태. Prisma의 Pass.status와 일치해야 한다.
 *
 * **EXPIRED는 없다.** 기간이 지난 것은 상태가 아니라 endAt과 지금의 비교다 —
 * 열로 두면 그것을 찍어 줄 무언가(크론)가 필요해지고, 안 찍힌 행과 찍힌 행이
 * 섞이는 순간 어느 쪽을 믿을지 모호해진다.
 */
export const PASS_STATUSES = [
  "REQUESTED",
  "CONSENTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export type PassStatus = (typeof PASS_STATUSES)[number];

export const PASS_STATUS_LABELS: Record<PassStatus, string> = {
  REQUESTED: "승인 대기",
  CONSENTED: "보호자 확인됨",
  APPROVED: "승인됨",
  REJECTED: "반려됨",
  CANCELLED: "취소됨",
};

export function isPassStatus(value: unknown): value is PassStatus {
  return typeof value === "string" && (PASS_STATUSES as readonly string[]).includes(value);
}

/**
 * 보호자 확인이 필요한 유형. 외박만이다 — 외출은 당일 귀교라 보호자 확인이
 * 관행이 아니고, 넣으면 방과 후 병원 한 번에 세 사람이 붙는다.
 */
export function requiresConsent(type: PassType): boolean {
  return type === "OVERNIGHT";
}

/**
 * 승인·반려가 가능한 상태. 조건부 갱신의 `where.status.in`에 그대로 들어간다 —
 * 이 배열이 곧 동시 결재를 막는 장치다.
 */
export const DECIDABLE_STATUSES: readonly PassStatus[] = ["REQUESTED", "CONSENTED"];
