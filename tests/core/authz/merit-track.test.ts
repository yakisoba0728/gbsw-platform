import { describe, expect, it } from "vitest";
import {
  isMeritKind,
  isMeritTrack,
  isYearScoped,
  MERIT_KIND_LABELS,
  MERIT_KINDS,
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
} from "@/core/authz/merit-track";

describe("MeritTrack", () => {
  it("트랙은 교내와 기숙사 둘뿐이다", () => {
    expect(MERIT_TRACKS).toEqual(["SCHOOL", "DORM"]);
  });

  it("모든 트랙에 한글 라벨이 있다", () => {
    for (const track of MERIT_TRACKS) {
      expect(MERIT_TRACK_LABELS[track]).toBeTruthy();
    }
    expect(MERIT_TRACK_LABELS.SCHOOL).toBe("교내");
    expect(MERIT_TRACK_LABELS.DORM).toBe("기숙사");
  });

  it("교내만 학년도별로 센다 — 기숙사는 전체 누적이다", () => {
    expect(isYearScoped("SCHOOL")).toBe(true);
    expect(isYearScoped("DORM")).toBe(false);
  });

  it("모르는 값은 트랙이 아니다", () => {
    expect(isMeritTrack("SCHOOL")).toBe(true);
    expect(isMeritTrack("DORM")).toBe(true);
    expect(isMeritTrack("school")).toBe(false);
    expect(isMeritTrack("CLUB")).toBe(false);
    expect(isMeritTrack(null)).toBe(false);
    expect(isMeritTrack(1)).toBe(false);
  });
});

describe("MeritKind", () => {
  it("종류는 상점과 벌점 둘뿐이다", () => {
    expect(MERIT_KINDS).toEqual(["MERIT", "DEMERIT"]);
  });

  it("모든 종류에 한글 라벨이 있다", () => {
    expect(MERIT_KIND_LABELS.MERIT).toBe("상점");
    expect(MERIT_KIND_LABELS.DEMERIT).toBe("벌점");
  });

  it("모르는 값은 종류가 아니다", () => {
    expect(isMeritKind("MERIT")).toBe(true);
    expect(isMeritKind("BONUS")).toBe(false);
    expect(isMeritKind(undefined)).toBe(false);
  });
});
