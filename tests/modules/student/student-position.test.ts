import { describe, expect, it } from "vitest";
import {
  MAX_CLASS_NO,
  MAX_GRADE,
  MAX_NUMBER,
  MIN_CLASS_NO,
  MIN_GRADE,
  MIN_NUMBER,
  NumberTakenError,
} from "@/modules/student/student-position";

describe("학생 배치 규칙", () => {
  it("각 범위가 유효하다", () => {
    expect(MIN_GRADE).toBeLessThan(MAX_GRADE);
    expect(MIN_CLASS_NO).toBeLessThan(MAX_CLASS_NO);
    expect(MIN_NUMBER).toBeLessThan(MAX_NUMBER);
  });

  it("번호 충돌 오류는 모든 저장 경로에서 같은 클래스다", async () => {
    const enrollmentRepo = await import("@/modules/enrollment/enrollment.repo");
    const registrationRepo = await import("@/modules/registration/registration.repo");
    const adminUserRepo = await import("@/modules/admin-users/admin-user.repo");
    const rosterRepo = await import("@/modules/enrollment/roster.repo");

    expect(new NumberTakenError()).toBeInstanceOf(Error);
    expect(enrollmentRepo.NumberTakenError).toBe(NumberTakenError);
    expect(registrationRepo.NumberTakenError).toBe(NumberTakenError);
    expect(adminUserRepo.NumberTakenError).toBe(NumberTakenError);
    expect(rosterRepo.NumberTakenError).toBe(NumberTakenError);
  });
});
