import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-pass-flash-0123456789";
});

const { issuePassFlash, PASS_FLASH_COOKIE, PASS_FLASH_HEADER } = await import(
  "@/modules/pass/pass-flash"
);
const { proxy } = await import("@/proxy");

function request(path: string, token?: string, forgedHeader?: string) {
  const headers = new Headers();
  if (token) headers.set("cookie", `${PASS_FLASH_COOKIE}=${token}`);
  if (forgedHeader) headers.set(PASS_FLASH_HEADER, forgedHeader);
  return new NextRequest(`http://student.localhost:3000${path}`, { headers });
}

describe("pass flash proxy", () => {
  it("서명된 쿠키만 내부 요청 헤더로 옮기고 응답에서 즉시 지운다", () => {
    const token = issuePassFlash("requested", "student-1");

    const response = proxy(request("/pass", token));

    expect(response.headers.get(`x-middleware-request-${PASS_FLASH_HEADER}`)).toBe(
      token,
    );
    expect(response.headers.get("set-cookie")).toContain(
      `${PASS_FLASH_COOKIE}=`,
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("브라우저가 직접 보낸 내부 헤더와 위조 쿠키는 전달하지 않는다", () => {
    const response = proxy(request("/pass", "forged", "approved"));

    expect(
      response.headers.get(`x-middleware-request-${PASS_FLASH_HEADER}`),
    ).toBeNull();
  });

  it("하위 출입증 경로에서는 플래시를 소비하지 않는다", () => {
    const token = issuePassFlash("approved", "teacher-1");

    const response = proxy(request("/pass/history", token));

    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
