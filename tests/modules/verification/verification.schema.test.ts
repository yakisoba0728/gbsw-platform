import { describe, expect, it } from "vitest";
import { emailField, phoneField } from "@/lib/user-fields";
import {
  emailTargetSchema,
  phoneTargetSchema,
} from "@/modules/verification/verification.schema";

/**
 * M5 회귀 테스트.
 *
 * verification.schema.ts는 한때 phoneField의 정규식·정규화를 통째로 복제해
 * 갖고 있었다 — 결과가 우연히 같았을 뿐, 한쪽만 고치면 requireVerified가
 * 가입 입력과 다른 문자열을 찾아 가입이 통째로 막히는 조용한 사고였다.
 *
 * 동작이 아니라 **참조가 같은지**를 확인한다 — 값만 비교하면 누군가 다시
 * 복제해서 우연히 같은 결과를 내는 코드를 심어도 이 테스트가 못 잡는다.
 */
describe("verification.schema — user-fields와 같은 스키마를 쓴다", () => {
  it("phoneTargetSchema는 phoneField 그 자체다", () => {
    expect(phoneTargetSchema).toBe(phoneField);
  });

  it("emailTargetSchema는 emailField 그 자체다", () => {
    expect(emailTargetSchema).toBe(emailField);
  });
});
