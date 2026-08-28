import { describe, expect, it } from "vitest";
import {
  DECIDABLE_STATUSES,
  isPassStatus,
  isPassType,
  isRevocable,
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

describe("isRevocable — 무를 값어치가 남았는가", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");
  const later = new Date("2026-08-28T18:00:00.000Z");
  const earlier = new Date("2026-08-28T06:00:00.000Z");

  it("승인됐고 아직 안 끝났으면 무를 수 있다 — 시작 전이어도 그렇다", () => {
    expect(isRevocable("APPROVED", later, now)).toBe(true);
  });

  it("**이것이 고친 결함이다** — 다음 주 외박도 지금 무를 수 있어야 한다", () => {
    expect(isRevocable("APPROVED", new Date("2026-09-05T00:00:00.000Z"), now)).toBe(true);
  });

  it("이미 끝난 건은 무를 것이 없다", () => {
    expect(isRevocable("APPROVED", earlier, now)).toBe(false);
  });

  it("끝나는 시각이 바로 지금이면 끝난 것으로 본다", () => {
    expect(isRevocable("APPROVED", now, now)).toBe(false);
  });

  it.each(["REQUESTED", "CONSENTED"])(
    "%s는 승인·반려가 답하는 자리라 취소를 겹치지 않는다",
    (status) => {
      expect(isRevocable(status, later, now)).toBe(false);
    },
  );

  it.each(["REJECTED", "CANCELLED"])("%s는 이미 끝난 상태다", (status) => {
    expect(isRevocable(status, later, now)).toBe(false);
  });

  it("모르는 상태는 무르지 않는다", () => {
    expect(isRevocable("", later, now)).toBe(false);
    expect(isRevocable("WHATEVER", later, now)).toBe(false);
  });
});
