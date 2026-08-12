import { describe, expect, it } from "vitest";
import {
  assertAligoSuccess,
  buildAligoBody,
  maskPhone,
  readAligoConfig,
  toAligoNumber,
  type AligoConfig,
} from "@/modules/verification/senders/aligo";

const config: AligoConfig = {
  key: "test-key",
  userId: "gbswhs",
  sender: "054-832-2903",
  testMode: false,
};

describe("readAligoConfig()", () => {
  it("셋 중 하나라도 없으면 설정이 아니다 — 콘솔로 떨어져야 한다", () => {
    expect(readAligoConfig({})).toBeNull();
    expect(
      readAligoConfig({ SMS_KEY: "k", SMS_USER_ID: "u" }),
    ).toBeNull();
  });

  it("다 있으면 읽고, 테스트모드는 명시할 때만 켜진다", () => {
    const base = {
      SMS_KEY: "k",
      SMS_USER_ID: "u",
      SMS_SENDER: "054-832-2903",
    };

    expect(readAligoConfig(base)?.testMode).toBe(false);
    expect(
      readAligoConfig({ ...base, SMS_TEST_MODE: "true" })?.testMode,
    ).toBe(true);
  });
});

describe("toAligoNumber() / maskPhone()", () => {
  it("알리고에는 숫자만 보낸다", () => {
    expect(toAligoNumber("010-1234-5678")).toBe("01012345678");
  });

  it("로그에는 가운데를 가린 번호만 남긴다", () => {
    expect(maskPhone("010-1234-5678")).toBe("010-****-5678");
    expect(maskPhone("123")).toBe("***");
  });
});

describe("buildAligoBody()", () => {
  it("문서에 적힌 필드를 그대로 채운다", () => {
    const body = buildAligoBody(config, "010-1234-5678", "인증번호 123456");

    expect(body.get("key")).toBe("test-key");
    expect(body.get("user_id")).toBe("gbswhs");
    expect(body.get("sender")).toBe("054-832-2903");
    expect(body.get("cnt")).toBe("1");
    expect(body.get("msg_type")).toBe("SMS");
    expect(body.get("rec_1")).toBe("01012345678");
    expect(body.get("msg_1")).toBe("인증번호 123456");
  });

  it("테스트모드가 아니면 testmode_yn을 넣지 않는다", () => {
    expect(buildAligoBody(config, "01012345678", "x").has("testmode_yn")).toBe(
      false,
    );
    expect(
      buildAligoBody({ ...config, testMode: true }, "01012345678", "x").get(
        "testmode_yn",
      ),
    ).toBe("Y");
  });
});

describe("assertAligoSuccess()", () => {
  it("접수 성공이면 msg_id를 돌려준다", () => {
    expect(
      assertAligoSuccess({
        result_code: "1",
        message: "success",
        success_cnt: 1,
        error_cnt: 0,
        msg_id: "1419776785",
      }),
    ).toBe("1419776785");
  });

  it("result_code가 숫자로 와도 성공으로 본다", () => {
    expect(() =>
      assertAligoSuccess({ result_code: 1, success_cnt: 1, error_cnt: 0 }),
    ).not.toThrow();
  });

  it("실패는 삼키지 않고 던진다", () => {
    // 기존 마일리지 구현이 오류를 로그만 찍고 넘어가던 지점이다.
    expect(() =>
      assertAligoSuccess({ result_code: "-101", message: "인증오류" }),
    ).toThrow("알리고 발송 실패");

    expect(() =>
      assertAligoSuccess({ result_code: "1", success_cnt: 0, error_cnt: 1 }),
    ).toThrow();
  });
});
