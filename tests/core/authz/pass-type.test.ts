import { describe, expect, it } from "vitest";
import {
  isPassStatus,
  isPassType,
  PASS_STATUS_LABELS,
  PASS_STATUSES,
  PASS_TYPE_LABELS,
  PASS_TYPES,
} from "@/core/authz/pass-type";

/* 출입증 정책(requiresConsent·DECIDABLE_STATUSES·LIVE_STATUSES·isRevocable)은
   모듈이 소유한다 — tests/modules/pass/pass.policy.test.ts */

describe("pass-type", () => {
  it("유형은 외출·외박 둘뿐이다", () => {
    expect(PASS_TYPES).toEqual(["OUTING", "OVERNIGHT"]);
    expect(PASS_TYPE_LABELS.OUTING).toBe("외출");
    expect(PASS_TYPE_LABELS.OVERNIGHT).toBe("외박");
  });

  it("모든 유형·상태에 라벨이 있다", () => {
    for (const type of PASS_TYPES) expect(PASS_TYPE_LABELS[type]).toBeTruthy();
    for (const status of PASS_STATUSES) expect(PASS_STATUS_LABELS[status]).toBeTruthy();
  });

  it("유형을 함께 보지 못하는 REQUESTED 집계는 두 다음 단계를 모두 밝힌다", () => {
    expect(PASS_STATUS_LABELS.REQUESTED).toBe("보호자 확인/승인 대기");
  });

  it("모르는 값은 걸러낸다", () => {
    expect(isPassType("OUTING")).toBe(true);
    expect(isPassType("EXPIRED")).toBe(false);
    expect(isPassType(null)).toBe(false);
    expect(isPassStatus("APPROVED")).toBe(true);
    expect(isPassStatus("EXPIRED")).toBe(false);
  });
});
