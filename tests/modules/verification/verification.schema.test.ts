import { describe, expect, it } from "vitest";
import { emailField, phoneField } from "@/lib/user-fields";
import {
  emailTargetSchema,
  phoneTargetSchema,
} from "@/modules/verification/verification.schema";

describe("verification.schema — user-fields와 같은 스키마를 쓴다", () => {
  it("phoneTargetSchema는 phoneField 그 자체다", () => {
    expect(phoneTargetSchema).toBe(phoneField);
  });

  it("emailTargetSchema는 emailField 그 자체다", () => {
    expect(emailTargetSchema).toBe(emailField);
  });
});
