import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/pass/actions", () => ({
  approveAction: vi.fn(),
  rejectAction: vi.fn(),
}));

const { DecisionPanel } = await import("@/app/(app)/pass/decision-panel");

describe("DecisionPanel", () => {
  it("보호자 미확인 외박은 경고와 전화 확인 대행 입력을 보여 준다", () => {
    const html = renderToStaticMarkup(
      <DecisionPanel passId="pass-1" needsProxyConsent />,
    );

    expect(html).toContain("보호자 확인되지 않음");
    expect(html).toContain("전화로 보호자 확인함");
    expect(html).toContain('name="consentNote"');
    expect(html).toContain("확인 방법");
    expect(html).not.toContain("승인 메모");
  });

  it("보호자가 확인한 신청은 교사 승인 메모를 따로 받는다", () => {
    const html = renderToStaticMarkup(
      <DecisionPanel passId="pass-2" needsProxyConsent={false} />,
    );

    expect(html).not.toContain("보호자 확인되지 않음");
    expect(html).toContain("승인 메모");
    expect(html).toContain('name="decisionNote"');
    expect(html).not.toContain('name="consentNote"');
    expect(html).not.toContain("확인 방법");
  });
});
