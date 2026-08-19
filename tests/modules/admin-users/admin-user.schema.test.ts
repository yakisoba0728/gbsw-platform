import { describe, expect, it } from "vitest";
import {
  deleteUserSchema,
  setUserActiveSchema,
  updateUserFormSchema,
  updateUserSchema,
  userIdOnlySchema,
} from "@/modules/admin-users/admin-user.schema";
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
  updatedAt: "2026-08-19T00:00:00.000Z",
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

/**
 * 계정 관리 액션의 **경계 스키마**.
 *
 * 이 넷은 한때 존재하지 않았다 — `admin/users/actions.ts`가 userId·active·
 * confirmName을 `String(formData.get(...))`로 읽어 zod를 통째로 건너뛰었다.
 * 저장소의 다른 아홉 액션 모듈은 전부 스키마를 통과시키므로, 여기가
 * "zod 검증은 경계에서 한 번만"에서 한 번이 0번이던 유일한 자리였다.
 */
describe("userIdOnlySchema", () => {
  it("id가 있으면 통과한다", () => {
    expect(userIdOnlySchema.safeParse({ userId: "u-1" }).success).toBe(true);
  });

  it("빈 값·공백·누락은 거부한다", () => {
    for (const userId of ["", "   ", undefined, null]) {
      expect(userIdOnlySchema.safeParse({ userId }).success, String(userId)).toBe(false);
    }
  });

  it("거부 문구는 한글이다 — zod 영문 기본값이 화면에 나가면 안 된다", () => {
    const parsed = userIdOnlySchema.safeParse({ userId: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("계정을 찾을 수 없습니다.");
    }
  });
});

describe("setUserActiveSchema", () => {
  it('"true"/"false"를 불리언으로 바꾼다', () => {
    const on = setUserActiveSchema.safeParse({ userId: "u-1", active: "true" });
    const off = setUserActiveSchema.safeParse({ userId: "u-1", active: "false" });

    expect(on.success && on.data.active).toBe(true);
    expect(off.success && off.data.active).toBe(false);
  });

  /*
   * 예전 코드(`formData.get("active") === "true"`)는 모르는 값을 전부 false로
   * 읽었다 — 계정을 잠그는 쪽으로 조용히 기울어 있었다.
   */
  it("셋째 값은 비활성으로 읽지 않고 거부한다", () => {
    for (const active of ["ture", "TRUE", "1", "", undefined]) {
      expect(
        setUserActiveSchema.safeParse({ userId: "u-1", active }).success,
        String(active),
      ).toBe(false);
    }
  });

  it("거부 문구는 한글이다", () => {
    const parsed = setUserActiveSchema.safeParse({ userId: "u-1", active: "1" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("계정 상태 값이 올바르지 않습니다.");
    }
  });
});

describe("deleteUserSchema", () => {
  it("id와 확인 이름이 있으면 통과한다", () => {
    expect(
      deleteUserSchema.safeParse({ userId: "u-1", confirmName: "홍길동" }).success,
    ).toBe(true);
  });

  it("확인 이름이 비었거나 공백뿐이면 거부한다", () => {
    for (const confirmName of ["", "   ", undefined]) {
      expect(
        deleteUserSchema.safeParse({ userId: "u-1", confirmName }).success,
        String(confirmName),
      ).toBe(false);
    }
  });

  /*
   * **정답 대조는 여기서 하지 않는다.** 진짜 이름은 DB에 있고 그 판단은
   * 서비스(NAME_MISMATCH)의 일이다 — 경계는 칸이 채워져 왔는지만 본다.
   */
  it("이름이 틀렸는지는 보지 않는다 — 통과시키고 서비스가 가른다", () => {
    expect(
      deleteUserSchema.safeParse({ userId: "u-1", confirmName: "전혀다른이름" }).success,
    ).toBe(true);
  });

  it("이름이 지나치게 길면 거부한다", () => {
    expect(
      deleteUserSchema.safeParse({ userId: "u-1", confirmName: "가".repeat(51) }).success,
    ).toBe(false);
  });
});

describe("updateUserFormSchema", () => {
  it("서비스 입력 + userId를 함께 받는다", () => {
    const parsed = updateUserFormSchema.safeParse({ ...base, userId: "u-1" });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.userId).toBe("u-1");
  });

  it("userId가 없으면 나머지가 멀쩡해도 거부한다", () => {
    expect(updateUserFormSchema.safeParse(base).success).toBe(false);
  });

  /* .extend로 이었으므로 원본은 여전히 서비스가 받는 모양 그대로여야 한다. */
  it("updateUserSchema는 userId를 요구하지 않는다 — 서비스 입력 모양은 그대로다", () => {
    expect(updateUserSchema.safeParse(base).success).toBe(true);
  });
});
