import { describe, expect, it } from "vitest";
import {
  DECIDABLE_STATUSES,
  isRevocable,
  LIVE_STATUSES,
  requiresConsent,
} from "@/modules/pass/pass.policy";

describe("출입증 정책 — 상태 집합", () => {
  it("살아 있는 상태는 신청·동의·승인 세 가지다", () => {
    expect(LIVE_STATUSES).toEqual(["REQUESTED", "CONSENTED", "APPROVED"]);
  });

  it("결재할 수 있는 상태는 대기·보호자확인 둘뿐이다", () => {
    expect([...DECIDABLE_STATUSES].sort()).toEqual(["CONSENTED", "REQUESTED"]);
  });
});

describe("출입증 정책 — 보호자 동의", () => {
  it("보호자 확인은 외박에만 필요하다", () => {
    expect(requiresConsent("OVERNIGHT")).toBe(true);
    expect(requiresConsent("OUTING")).toBe(false);
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
