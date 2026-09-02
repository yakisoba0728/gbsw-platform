import { describe, expect, it } from "vitest";
import { isUniqueViolation, NumberTakenError } from "@/core/db/unique-violation";

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
    const error = adapterP2002(["year", "grade", "classNo", "number"]);
    expect(isUniqueViolation(error, "number")).toBe(true);
    expect(isUniqueViolation(error, "classNo")).toBe(true);
  });

  it("제약에 없는 필드로는 잡히지 않는다", () => {
    expect(isUniqueViolation(adapterP2002(["email"]), "number")).toBe(false);
    expect(
      isUniqueViolation(adapterP2002(["year", "grade", "classNo", "number"]), "email"),
    ).toBe(false);
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
    expect(
      isUniqueViolation(legacyP2002(["year", "grade", "classNo", "number"]), "number"),
    ).toBe(true);
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
    expect(new NumberTakenError()).toBeInstanceOf(enrollmentRepo.NumberTakenError);
  });
});
