import { describe, expect, it } from "vitest";
import {
  isSerializationConflict,
  isTransactionFatal,
  isTransactionTimeout,
} from "@/core/db/transaction-conflict";

function wrapped(originalCode: string) {
  return Object.assign(new Error("db"), {
    code: "P2010",
    meta: { driverAdapterError: { cause: { originalCode } } },
  });
}

describe("isSerializationConflict — 다시 열면 되는가", () => {
  it("Prisma가 쓰기 충돌로 분류하면 재시도한다", () => {
    expect(isSerializationConflict(Object.assign(new Error("x"), { code: "P2034" }))).toBe(
      true,
    );
  });

  it("어댑터가 감춰 온 40001도 재시도한다", () => {
    expect(isSerializationConflict(wrapped("40001"))).toBe(true);
  });

  it("어댑터가 감춰 온 교착(40P01)도 재시도한다 — 앱을 다시 열면 되는 충돌이다", () => {
    expect(isSerializationConflict(wrapped("40P01"))).toBe(true);
  });

  it("어댑터가 종류만 줘도(TransactionWriteConflict) 재시도한다", () => {
    const error = Object.assign(new Error("x"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict" } } },
    });
    expect(isSerializationConflict(error)).toBe(true);
  });

  it("이미 중단된 트랜잭션(25P02)은 재시도 근거가 아니다", () => {
    expect(isSerializationConflict(wrapped("25P02"))).toBe(false);
  });

  it("날 SQLSTATE는 보지 않는다 — Prisma를 거친 오류만 본다", () => {
    expect(isSerializationConflict(Object.assign(new Error("x"), { code: "40001" }))).toBe(
      false,
    );
  });

  it("연결 끊김 같은 오류는 재시도 대상이 아니다", () => {
    expect(isSerializationConflict(wrapped("08006"))).toBe(false);
  });

  it("오류처럼 안 생긴 값에도 안 터진다", () => {
    for (const value of [null, undefined, "P2034", 2034, [], {}]) {
      expect(() => isSerializationConflict(value)).not.toThrow();
      expect(isSerializationConflict(value)).toBe(false);
    }
  });
});

describe("isTransactionFatal — 삼키면 안 되는가", () => {
  it("트랜잭션을 죽이는 상태 셋을 모두 올려 보낸다", () => {
    for (const state of ["40001", "40P01", "25P02"]) {
      expect(isTransactionFatal(wrapped(state))).toBe(true);
      expect(isTransactionFatal(Object.assign(new Error("x"), { code: state }))).toBe(true);
    }
  });

  it("바깥 코드가 P2010이 아니어도 안쪽 원인을 본다", () => {
    const error = Object.assign(new Error("x"), {
      meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict" } } },
    });
    expect(isTransactionFatal(error)).toBe(true);
  });

  it("연결 끊김은 감사 기록을 막을 이유가 아니다", () => {
    expect(isTransactionFatal(wrapped("08006"))).toBe(false);
  });

  it("오류처럼 안 생긴 값에도 안 터진다", () => {
    for (const value of [null, undefined, "P2034", 2034, [], {}]) {
      expect(() => isTransactionFatal(value)).not.toThrow();
      expect(isTransactionFatal(value)).toBe(false);
    }
  });
});

describe("isTransactionTimeout — 트랜잭션 예산 초과", () => {
  it("P2028은 예산 초과다", () => {
    expect(
      isTransactionTimeout(Object.assign(new Error("x"), { code: "P2028" })),
    ).toBe(true);
  });

  it("나머지 Prisma·SQLSTATE 코드는 예산 초과가 아니다", () => {
    for (const code of ["P2002", "P2010", "P2034", "40001", "40P01"]) {
      expect(isTransactionTimeout(Object.assign(new Error("x"), { code }))).toBe(
        false,
      );
    }
  });

  it("오류처럼 안 생긴 값에도 안 터진다", () => {
    for (const value of [null, undefined, "P2028", 2028, [], {}]) {
      expect(() => isTransactionTimeout(value)).not.toThrow();
      expect(isTransactionTimeout(value)).toBe(false);
    }
  });
});

describe("두 판정의 경계", () => {
  it("교착(40P01)은 재시도 충돌이면서 삼키지도 않는다 — 중단(25P02)은 재시도 대상이 아니다", () => {
    expect(isTransactionFatal(wrapped("40P01"))).toBe(true);
    expect(isSerializationConflict(wrapped("40P01"))).toBe(true);

    expect(isTransactionFatal(wrapped("25P02"))).toBe(true);
    expect(isSerializationConflict(wrapped("25P02"))).toBe(false);
  });

  it("40001과 P2034에서는 둘의 답이 같다", () => {
    for (const error of [wrapped("40001"), Object.assign(new Error("x"), { code: "P2034" })]) {
      expect(isTransactionFatal(error)).toBe(true);
      expect(isSerializationConflict(error)).toBe(true);
    }
  });
});
