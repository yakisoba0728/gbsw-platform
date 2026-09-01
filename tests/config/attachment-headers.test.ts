import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("첨부 응답 보안 헤더", () => {
  it("전역 규칙 뒤에서 첨부 전용 CSP와 nosniff를 덮어쓴다", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");

    const rules = await nextConfig.headers!();
    const globalIndex = rules.findIndex((rule) => rule.source === "/:path*");
    const attachmentIndex = rules.findIndex(
      (rule) => rule.source === "/api/community/attachments/:id*",
    );

    expect(globalIndex).toBeGreaterThanOrEqual(0);
    expect(attachmentIndex).toBeGreaterThan(globalIndex);

    const attachmentHeaders = Object.fromEntries(
      rules[attachmentIndex].headers.map(({ key, value }) => [key, value]),
    );
    expect(attachmentHeaders["Content-Security-Policy"]).toBe(
      "default-src 'none'; sandbox",
    );
    expect(attachmentHeaders["X-Content-Type-Options"]).toBe("nosniff");
  });
});
