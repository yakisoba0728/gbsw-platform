import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 실제 redirect()·notFound()는 던져서 그 자리의 실행을 끊는다(Next 내부 특수 오류).
 * 여기서도 던지게 흉내 내어, 가드가 그 뒤로 값을 흘려보내지 않는지까지 함께 본다.
 */
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({ redirect, notFound }));

const { orDenied } = await import("@/app/(app)/community/guard");
const { ForbiddenError } = await import("@/core/authz/errors");
const { CommunityError } = await import("@/modules/community/community.error");

beforeEach(() => {
  redirect.mockClear();
  notFound.mockClear();
});

describe("orDenied — 통과", () => {
  it("성공한 조회는 값을 그대로 준다", async () => {
    await expect(orDenied(Promise.resolve({ name: "자유게시판" }))).resolves.toEqual({
      name: "자유게시판",
    });
    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("orDenied — 권한 없음은 403으로 보낸다", () => {
  it("ForbiddenError면 /forbidden으로 보낸다", async () => {
    await expect(
      orDenied(Promise.reject(new ForbiddenError("community:read"))),
    ).rejects.toThrow("REDIRECT:/forbidden");
    expect(redirect).toHaveBeenCalledWith("/forbidden");
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("orDenied — 없는 것은 404로 보낸다", () => {
  it.each(["COMMUNITY_NOT_FOUND", "POST_NOT_FOUND", "COMMENT_NOT_FOUND"])(
    "%s면 404다",
    async (code) => {
      await expect(orDenied(Promise.reject(new CommunityError(code)))).rejects.toThrow(
        "NOT_FOUND",
      );
      expect(notFound).toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    },
  );
});

describe("orDenied — 화면이 답할 일이 아닌 것은 그대로 던진다", () => {
  it.each(["SLUG_TAKEN", "COMMUNITY_CONFLICT", "ANONYMOUS_IRREVERSIBLE", "REASON_REQUIRED"])(
    "%s는 액션의 몫이라 손대지 않는다",
    async (code) => {
      await expect(orDenied(Promise.reject(new CommunityError(code)))).rejects.toThrow(code);
      expect(redirect).not.toHaveBeenCalled();
      expect(notFound).not.toHaveBeenCalled();
    },
  );

  it("남남인 오류는 그대로 올려 보낸다 — 오류 경계가 받아야 한다", async () => {
    await expect(orDenied(Promise.reject(new Error("DB가 죽었다")))).rejects.toThrow(
      "DB가 죽었다",
    );
    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("**redirect()가 담긴 오류를 삼키지 않는다** — 정규 주소로 보내는 길이 막히면 안 된다", async () => {
    await expect(
      orDenied(Promise.reject(new Error("REDIRECT:/community/free/p1"))),
    ).rejects.toThrow("REDIRECT:/community/free/p1");
    expect(redirect).not.toHaveBeenCalled();
  });
});
