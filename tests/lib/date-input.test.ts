import { describe, expect, it } from "vitest";
import {
  canonicalDateInputSchema,
  isCanonicalDateInput,
} from "@/lib/date-input";

describe("isCanonicalDateInput()", () => {
  it.each(["2000-02-29", "2024-02-29", "2010-04-30", "2010-12-31"])(
    "실제 달력 날짜 %s를 허용한다",
    (value) => expect(isCanonicalDateInput(value)).toBe(true),
  );

  it.each([
    "1900-02-29",
    "2026-02-29",
    "2010-02-30",
    "2010-04-31",
    "2010-13-01",
    "2010-2-03",
    " 2010-02-03",
  ])("없는 날짜나 비정규 입력 %s를 거부한다", (value) => {
    expect(isCanonicalDateInput(value)).toBe(false);
  });
});

describe("canonicalDateInputSchema()", () => {
  const schema = canonicalDateInputSchema("FORMAT", "INVALID");

  it("형식과 실제 달력 오류를 구분한다", () => {
    expect(schema.safeParse("2010/02/03").error?.issues[0]?.message).toBe("FORMAT");
    expect(schema.safeParse("2010-02-30").error?.issues[0]?.message).toBe("INVALID");
  });
});
