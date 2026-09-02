import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkInviteAction: vi.fn(),
  completeRegistrationAction: vi.fn(),
  useActionState: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: mocks.useActionState };
});

vi.mock("@/app/(auth)/register/actions", () => ({
  checkInviteAction: mocks.checkInviteAction,
  completeRegistrationAction: mocks.completeRegistrationAction,
}));

const { RegisterFlow } = await import("@/app/(auth)/register/register-flow");

beforeEach(() => {
  mocks.useActionState.mockReset().mockReturnValue([
    {
      code: null,
      role: null,
      error: "가입코드 또는 입력한 정보가 맞지 않습니다.",
      values: { code: "GBSW-A3K9-2M7P" },
    },
    vi.fn(),
    false,
  ]);
});

describe("RegisterFlow", () => {
  it("가입코드 확인이 실패해도 제출값을 입력칸에 되심는다", () => {
    const html = renderToStaticMarkup(<RegisterFlow />);

    expect(html).toContain('name="code"');
    expect(html).toContain('value="GBSW-A3K9-2M7P"');
  });
});
