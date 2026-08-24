import { describe, expect, it } from "vitest";
import { isUniqueViolation, NumberTakenError } from "@/core/db/unique-violation";

/**
 * 유일 제약 위반 판정은 저장소에서 단 하나뿐인 경로다 — 관리자 사용자 수정·가입·
 * 명단 반영·학년도 생성이 모두 이 함수 하나로 "무엇이 중복인가"를 가른다.
 *
 * 여기가 조용히 false를 돌려주면 EmailTakenError·NumberTakenError·YearTakenError로
 * 옮겨지지 않고 원본 P2002가 그대로 화면까지 올라간다. 사용자에게는 "이미 쓰는
 * 번호입니다" 대신 알 수 없는 오류가 뜨고, 서버 로그에만 흔적이 남는다.
 *
 * 오류 모양은 Prisma 7 + @prisma/adapter-pg가 만드는 것이라 우리가 통제하지 못한다.
 * 어댑터 버전이 바뀌어 모양이 달라져도 **던지지는 않고 false로 떨어져야** 한다 —
 * 호출부(registration.repo·admin-user.repo·roster.repo)는 catch 블록 안에서 이 함수를
 * 부르므로, 여기서 예외가 나면 원래 오류 대신 TypeError가 위로 올라간다.
 */

/**
 * Prisma 7.9 + @prisma/adapter-pg에서 관측한 실물 모양.
 * tests/modules/{admin-users,enrollment}의 realWorldNumberP2002()와 같고,
 * tests/integration/enrollment.unique-constraint.integration.test.ts가 실 Postgres로 대조한다.
 */
function adapterP2002(fields: string[]) {
  return Object.assign(new Error("Unique constraint failed"), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    meta: {
      modelName: "Enrollment",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage: `duplicate key value violates unique constraint "${fields.join("_")}"`,
          kind: "UniqueConstraintViolation",
          constraint: { fields },
        },
      },
    },
  });
}

/** 어댑터가 컬럼 목록 대신 인덱스 이름만 주는 변종. */
function adapterIndexP2002(index: string) {
  return Object.assign(new Error("Unique constraint failed"), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    meta: {
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: { kind: "UniqueConstraintViolation", constraint: { index } },
      },
    },
  });
}

/** 어댑터 없이 돌던 시절(네이티브 엔진)의 모양. */
function legacyP2002(target: unknown) {
  return Object.assign(new Error("Unique constraint failed"), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    meta: { target },
  });
}

describe("isUniqueViolation() — 드라이버 어댑터 모양", () => {
  it("어댑터가 준 제약 컬럼 목록에서 필드를 찾아낸다", () => {
    expect(isUniqueViolation(adapterP2002(["email"]), "email")).toBe(true);
  });

  it("복합 제약이면 구성 컬럼 어느 쪽으로 물어도 잡힌다", () => {
    const error = adapterP2002(["classId", "number"]);
    expect(isUniqueViolation(error, "number")).toBe(true);
    expect(isUniqueViolation(error, "classId")).toBe(true);
  });

  it("제약에 없는 필드로는 잡히지 않는다", () => {
    expect(isUniqueViolation(adapterP2002(["email"]), "number")).toBe(false);
    expect(isUniqueViolation(adapterP2002(["classId", "number"]), "email")).toBe(false);
  });

  it("어댑터가 컬럼 목록 대신 인덱스 이름만 주면 이름 안에서 찾는다", () => {
    expect(isUniqueViolation(adapterIndexP2002("user_email_key"), "email")).toBe(true);
    expect(isUniqueViolation(adapterIndexP2002("user_email_key"), "number")).toBe(false);
  });

  it("컬럼 목록이 있으면 인덱스 이름은 보지 않는다 — 더 정확한 쪽이 이긴다", () => {
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: {
        driverAdapterError: {
          cause: { constraint: { fields: ["email"], index: "user_number_key" } },
        },
      },
    });
    expect(isUniqueViolation(error, "email")).toBe(true);
    expect(isUniqueViolation(error, "number")).toBe(false);
  });

  it("컬럼 목록이 있으면 구형 meta.target으로 내려가지 않는다", () => {
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: {
        target: ["number"],
        driverAdapterError: { cause: { constraint: { fields: ["email"] } } },
      },
    });
    expect(isUniqueViolation(error, "email")).toBe(true);
    expect(isUniqueViolation(error, "number")).toBe(false);
  });

  it("빈 컬럼 목록은 아무것도 잡지 않고, 그렇다고 meta.target으로 내려가지도 않는다", () => {
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: {
        target: ["email"],
        driverAdapterError: { cause: { constraint: { fields: [] } } },
      },
    });
    expect(isUniqueViolation(error, "email")).toBe(false);
  });
});

describe("isUniqueViolation() — 구형(meta.target) 모양", () => {
  it("배열로 온 target에서 필드를 찾는다 — 어댑터 없이 돌 때를 위한 뒷문", () => {
    expect(isUniqueViolation(legacyP2002(["email"]), "email")).toBe(true);
    expect(isUniqueViolation(legacyP2002(["classId", "number"]), "number")).toBe(true);
    expect(isUniqueViolation(legacyP2002(["email"]), "number")).toBe(false);
  });

  it("문자열 하나로 온 target은 정확히 같을 때만 잡는다", () => {
    expect(isUniqueViolation(legacyP2002("email"), "email")).toBe(true);
    expect(isUniqueViolation(legacyP2002("user_email_key"), "email")).toBe(false);
  });
});

describe("isUniqueViolation() — 유일 제약 위반이 아닌 것", () => {
  it("code가 P2002가 아니면 제약 정보가 멀쩡해도 false다", () => {
    const notFound = Object.assign(new Error("Record not found"), {
      code: "P2025",
      meta: { driverAdapterError: { cause: { constraint: { fields: ["email"] } } } },
    });
    expect(isUniqueViolation(notFound, "email")).toBe(false);

    const foreignKey = Object.assign(new Error("Foreign key constraint failed"), {
      code: "P2003",
      meta: { target: ["email"] },
    });
    expect(isUniqueViolation(foreignKey, "email")).toBe(false);
  });

  it("code가 아예 없어도 false다", () => {
    expect(isUniqueViolation({ meta: { target: ["email"] } }, "email")).toBe(false);
  });

  it("code가 문자열이 아니면 false다", () => {
    expect(isUniqueViolation({ code: 2002, meta: { target: ["email"] } }, "email")).toBe(false);
  });
});

describe("isUniqueViolation() — 모양이 깨진 입력에서 던지지 않는다", () => {
  /**
   * 호출부는 전부 catch 블록 안이다 (registration.repo.ts:168 등).
   * 여기서 예외가 나면 원래 P2002 대신 TypeError가 올라가 원인이 사라진다.
   * 그래서 "잡아내는가"보다 "던지지 않는가"가 이 함수의 핵심 계약이다.
   */
  const malformed: [string, unknown][] = [
    ["meta 자체가 없다", { code: "P2002" }],
    ["meta가 null이다", { code: "P2002", meta: null }],
    ["meta가 문자열이다", { code: "P2002", meta: "무엇인가" }],
    ["driverAdapterError가 null이다", { code: "P2002", meta: { driverAdapterError: null } }],
    ["driverAdapterError가 문자열이다", { code: "P2002", meta: { driverAdapterError: "붙었다" } }],
    ["driverAdapterError는 있는데 cause가 없다", { code: "P2002", meta: { driverAdapterError: {} } }],
    ["cause가 null이다", { code: "P2002", meta: { driverAdapterError: { cause: null } } }],
    ["cause는 있는데 constraint가 없다", { code: "P2002", meta: { driverAdapterError: { cause: {} } } }],
    ["constraint가 null이다", { code: "P2002", meta: { driverAdapterError: { cause: { constraint: null } } } }],
    ["constraint가 비었다", { code: "P2002", meta: { driverAdapterError: { cause: { constraint: {} } } } }],
    [
      "fields가 배열이 아니라 문자열이다",
      { code: "P2002", meta: { driverAdapterError: { cause: { constraint: { fields: "email" } } } } },
    ],
    [
      "fields가 null이고 index도 문자열이 아니다",
      { code: "P2002", meta: { driverAdapterError: { cause: { constraint: { fields: null, index: 7 } } } } },
    ],
    ["target이 null이다", { code: "P2002", meta: { target: null } }],
    ["target이 객체다", { code: "P2002", meta: { target: { column: "email" } } }],
    ["target이 숫자다", { code: "P2002", meta: { target: 1 } }],
  ];

  it.each(malformed)("%s — 던지지 않고 false로 떨어진다", (_label, error) => {
    expect(() => isUniqueViolation(error, "email")).not.toThrow();
    expect(isUniqueViolation(error, "email")).toBe(false);
  });

  it("Prisma 오류가 아닌 값에도 안전하다", () => {
    const notPrisma: unknown[] = [
      new Error("연결이 끊겼습니다"),
      null,
      undefined,
      "P2002",
      2002,
      [],
      {},
      Symbol("P2002"),
    ];
    for (const value of notPrisma) {
      expect(() => isUniqueViolation(value, "email")).not.toThrow();
      expect(isUniqueViolation(value, "email")).toBe(false);
    }
  });
});

describe("NumberTakenError", () => {
  it("Error를 상속한다 — 서비스의 instanceof 분기가 여기 걸려 있다", () => {
    const error = new NumberTakenError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(NumberTakenError);
  });

  it("repo들이 re-export하는 것이 같은 클래스다", async () => {
    const enrollmentRepo = await import("@/modules/enrollment/enrollment.repo");
    const registrationRepo = await import("@/modules/registration/registration.repo");
    const adminUserRepo = await import("@/modules/admin-users/admin-user.repo");
    const rosterRepo = await import("@/modules/enrollment/roster.repo");

    expect(enrollmentRepo.NumberTakenError).toBe(NumberTakenError);
    expect(registrationRepo.NumberTakenError).toBe(NumberTakenError);
    expect(adminUserRepo.NumberTakenError).toBe(NumberTakenError);
    expect(rosterRepo.NumberTakenError).toBe(NumberTakenError);
    // 서비스가 하는 판정을 그대로 재현한다 (enrollment.service.ts:180 등).
    expect(new NumberTakenError()).toBeInstanceOf(enrollmentRepo.NumberTakenError);
  });
});
