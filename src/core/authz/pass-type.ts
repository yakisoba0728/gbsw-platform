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
  // 유형을 모르는 필터·집계에서는 외출의 교사 승인과 외박의 보호자 확인을
  // 함께 센다. 둘 중 하나를 생략하면 같은 REQUESTED가 문맥마다 다른 뜻이 된다.
  REQUESTED: "보호자 확인/승인 대기",
  CONSENTED: "교사 승인 대기",
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

/**
 * **무를 값어치가 남아 있는 출입증인가.** 화면에 취소 자리를 낼지 정한다.
 *
 * 서비스의 `CANCELLABLE`(`REQUESTED`·`CONSENTED`·`APPROVED`)보다 좁다. 앞의 둘은
 * 결재 대기 화면이 이미 **승인·반려**로 답하고 있고, 반려는 사유가 필수라
 * 「누가 왜 막았나」가 더 잘 남는다 — 같은 자리에 취소를 겹쳐 놓으면 그 기록이
 * 흐려진다. 그래서 여기서는 **결재가 끝난 것만** 센다.
 *
 * 끝난 건을 빼는 이유는 무를 것이 남아 있지 않아서다. 확인창의 「학생의 QR이
 * 곧바로 통하지 않습니다」도 그때는 거짓말이 된다.
 */
export function isRevocable(status: string, endAt: Date, now: Date): boolean {
  return status === "APPROVED" && endAt.getTime() > now.getTime();
}
