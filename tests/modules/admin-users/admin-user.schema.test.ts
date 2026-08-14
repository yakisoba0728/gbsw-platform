import { describe, expect, it } from "vitest";
import { updateUserSchema } from "@/modules/admin-users/admin-user.schema";
import {
  MAX_CLASS_NO,
  MAX_GRADE,
  MAX_NUMBER,
  MIN_CLASS_NO,
  MIN_GRADE,
  MIN_NUMBER,
} from "@/modules/enrollment/enrollment.schema";

/**
 * M6 회귀 테스트.
 *
 * updateUserSchema는 한때 학년·반·번호 범위를 1~3/1~20/1~50으로 직접 박아
 * 두고 있었다 — enrollment.schema.ts(표 편집·명단 업로드가 쓰는 진짜 기준)와
 * 따로 놀다가 반이 20개를 넘는 날 이 파일만 조용히 안 늘어나는 게 문제였다.
 * 하드코딩된 숫자가 아니라 **enrollment.schema.ts의 상수 경계**로 검증해서,
 * 상수가 바뀌면 이 테스트도 자동으로 같이 따라가게 한다.
 */

const base = {
  name: "김학생",
  email: "student@gbsw.hs.kr",
  phone: "010-1234-5678",
  birthDate: "2010-01-01",
};

describe("updateUserSchema — 학년·반·번호는 enrollment.schema.ts의 상수를 따른다", () => {
  it("경계값은 통과한다", () => {
    const parsed = updateUserSchema.safeParse({
      ...base,
      grade: MAX_GRADE,
      classNo: MAX_CLASS_NO,
      number: MAX_NUMBER,
    });
    expect(parsed.success).toBe(true);
  });

  it("경계를 넘으면 거부한다", () => {
    expect(
      updateUserSchema.safeParse({ ...base, grade: MAX_GRADE + 1, classNo: 1, number: 1 })
        .success,
    ).toBe(false);
    expect(
      updateUserSchema.safeParse({ ...base, grade: 1, classNo: MAX_CLASS_NO + 1, number: 1 })
        .success,
    ).toBe(false);
    expect(
      updateUserSchema.safeParse({ ...base, grade: 1, classNo: 1, number: MAX_NUMBER + 1 })
        .success,
    ).toBe(false);
  });

  it("최솟값 아래면 거부한다", () => {
    expect(
      updateUserSchema.safeParse({
        ...base,
        grade: MIN_GRADE - 1,
        classNo: MIN_CLASS_NO,
        number: MIN_NUMBER,
      }).success,
    ).toBe(false);
  });
});
