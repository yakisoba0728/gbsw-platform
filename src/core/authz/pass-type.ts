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
 *
 * 인자가 `string`인 것은 실수가 아니다. 부르는 쪽은 대개 DB에서 온 값
 * (`Pass.type`)을 쥐고 있어서 `PassType`을 요구하면 호출부마다 캐스트가 생기고,
 * 그 캐스트는 검증이 아니라 「타입 검사를 조용히 시키는 일」이다.
 * `merit-track.ts`의 `meritKindDelta`가 같은 이유로 `string`을 받는다.
 * 모르는 값은 false로 떨어진다 — 확인을 요구하지 않는 쪽이 안전한 기본값이다.
 */
export function requiresConsent(type: string): boolean {
  return type === "OVERNIGHT";
}

/**
 * 승인·반려가 가능한 상태. 조건부 갱신의 `where.status.in`에 그대로 들어간다 —
 * 이 배열이 곧 동시 결재를 막는 장치다.
 */
export const DECIDABLE_STATUSES: readonly PassStatus[] = ["REQUESTED", "CONSENTED"];
