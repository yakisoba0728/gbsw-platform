import { describe, expect, it } from "vitest";
import {
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_LABELS,
  isEnrollmentStatus,
  keepsAccountActive,
} from "@/core/authz/enrollment-status";

describe("학적 상수", () => {
  it("모든 값에 한글 라벨이 있다", () => {
    for (const s of ENROLLMENT_STATUSES) {
      expect(ENROLLMENT_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it("라벨이 서로 겹치지 않는다 — 엑셀 표기를 상수로 되돌릴 수 있어야 한다", () => {
    const labels = Object.values(ENROLLMENT_STATUS_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("재학만 계정을 살려둔다", () => {
    expect(keepsAccountActive("ENROLLED")).toBe(true);
    for (const s of ENROLLMENT_STATUSES.filter((v) => v !== "ENROLLED")) {
      expect(keepsAccountActive(s)).toBe(false);
    }
  });

  it("모르는 값은 걸러낸다", () => {
    expect(isEnrollmentStatus("ENROLLED")).toBe(true);
    expect(isEnrollmentStatus("재학")).toBe(false);
    expect(isEnrollmentStatus(null)).toBe(false);
  });
});
