import { describe, expect, it } from "vitest";
import {
  LOGIN_DISABLED_MESSAGE,
  loginErrorMessage,
} from "@/app/(auth)/login/login-state";

describe("loginErrorMessage", () => {
  it("공개 오류 코드만 사용자 문구로 바꾼다", () => {
    expect(loginErrorMessage("credentials")).toBe(
      "이메일 또는 비밀번호가 맞지 않습니다.",
    );
    expect(loginErrorMessage("disabled")).toBe(LOGIN_DISABLED_MESSAGE);
    expect(loginErrorMessage("server")).toBe(
      "로그인 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });

  it("알 수 없거나 배열인 값은 무시한다", () => {
    expect(loginErrorMessage("forged-message")).toBeNull();
    expect(loginErrorMessage(["credentials"])).toBeNull();
  });
});
