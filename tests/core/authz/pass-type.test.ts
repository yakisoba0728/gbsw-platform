import { describe, expect, it } from "vitest";
import {
  DECIDABLE_STATUSES,
  isPassStatus,
  isPassType,
  PASS_STATUS_LABELS,
  PASS_STATUSES,
  PASS_TYPE_LABELS,
  PASS_TYPES,
  requiresConsent,
} from "@/core/authz/pass-type";

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

  it("보호자 확인은 외박에만 필요하다", () => {
    expect(requiresConsent("OVERNIGHT")).toBe(true);
    expect(requiresConsent("OUTING")).toBe(false);
  });

  it("결재할 수 있는 상태는 대기·보호자확인 둘뿐이다", () => {
    expect([...DECIDABLE_STATUSES].sort()).toEqual(["CONSENTED", "REQUESTED"]);
  });

  it("모르는 값은 걸러낸다", () => {
    expect(isPassType("OUTING")).toBe(true);
    expect(isPassType("EXPIRED")).toBe(false);
    expect(isPassType(null)).toBe(false);
    expect(isPassStatus("APPROVED")).toBe(true);
    expect(isPassStatus("EXPIRED")).toBe(false);
  });
});
