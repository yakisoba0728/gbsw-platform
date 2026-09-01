import { afterEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/core/authz/errors";
import {
  actionMessage,
  firstIssue,
  text,
} from "@/lib/action-message";

class DomainError extends Error {}

const MESSAGES = {
  FORBIDDEN: "이 화면에서 쓰는 권한 문구",
  KNOWN: "알고 있는 오류",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("actionMessage", () => {
  const messageFor = actionMessage(DomainError, MESSAGES, "[test]");

  it("권한·도메인 코드를 파일이 준 사전으로 옮긴다", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(messageFor(new ForbiddenError("test:manage"), "폴백")).toBe(
      "이 화면에서 쓰는 권한 문구",
    );
    expect(messageFor(new DomainError("KNOWN"), "폴백")).toBe(
      "알고 있는 오류",
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("모르는 코드는 호출별 폴백을 그대로 쓴다", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(messageFor(new DomainError("UNKNOWN"), "저장하지 못했습니다.")).toBe(
      "저장하지 못했습니다.",
    );
    expect(messageFor(new DomainError("UNKNOWN"), "폐기하지 못했습니다.")).toBe(
      "폐기하지 못했습니다.",
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("예상 못 한 오류는 원문을 감추고 서버 로그에 남긴다", () => {
    const error = new Error("화면에 내보내면 안 되는 내부 원인");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(messageFor(error, "처리하지 못했습니다.")).toBe(
      "처리하지 못했습니다.",
    );
    expect(consoleError).toHaveBeenCalledWith("[test] 예상 못 한 오류", error);
  });
});

describe("액션 입력 문구 헬퍼", () => {
  it("FormData 문자열은 다듬지 않고 읽고 없는 값은 빈 문자열이다", () => {
    const formData = new FormData();
    formData.set("name", "  입력 그대로  ");

    expect(text(formData, "name")).toBe("  입력 그대로  ");
    expect(text(formData, "missing")).toBe("");
  });

  it("첫 issue가 한글일 때만 노출하고 영문·빈 목록은 폴백한다", () => {
    expect(firstIssue({ issues: [{ message: "이름을 입력해 주세요." }] }, "폴백")).toBe(
      "이름을 입력해 주세요.",
    );
    expect(firstIssue({ issues: [{ message: "Invalid discriminator" }] }, "폴백")).toBe(
      "폴백",
    );
    expect(firstIssue({ issues: [] }, "폴백")).toBe("폴백");
  });
});
