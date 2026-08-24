import { describe, expect, it } from "vitest";
import {
  isSerializationConflict,
  isTransactionFatal,
} from "@/core/db/transaction-conflict";

/**
 * 판정이 두 개인 것이 이 파일의 요점이다. 하나로 합치려는 다음 사람이
 * 여기서 막혀야 한다 — 묻는 것이 다르므로 답도 다르다.
 */

/** 드라이버 어댑터가 원래 SQLSTATE를 감춰 오는 모양 (P2010). */
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

  it("어댑터가 종류만 줘도(TransactionWriteConflict) 재시도한다", () => {
    const error = Object.assign(new Error("x"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict" } } },
    });
    expect(isSerializationConflict(error)).toBe(true);
  });

  it("이미 중단된 트랜잭션(25P02)은 재시도 근거가 아니다", () => {
    // 원인이 아니라 여진이다 — 진짜 실패는 앞 문장에서 났다. 이걸 보고 다시 열면
    // 원인을 가린 채 같은 실패를 반복한다.
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
      // 어댑터를 거치지 않고 날 코드로 올라오는 경로도 받는다.
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

describe("두 판정의 경계", () => {
  it("교착·중단은 삼키지 않되 재시도하지도 않는다", () => {
    // 40P01 교착은 Prisma가 P2034로 싸 주므로 재시도 갈래는 그쪽에서 잡는다.
    // 25P02는 애초에 원인이 아니다. 둘 다 삼키면 원래 코드만 사라진다.
    for (const state of ["40P01", "25P02"]) {
      expect(isTransactionFatal(wrapped(state))).toBe(true);
      expect(isSerializationConflict(wrapped(state))).toBe(false);
    }
  });

  it("40001과 P2034에서는 둘의 답이 같다", () => {
    for (const error of [wrapped("40001"), Object.assign(new Error("x"), { code: "P2034" })]) {
      expect(isTransactionFatal(error)).toBe(true);
      expect(isSerializationConflict(error)).toBe(true);
    }
  });
});
