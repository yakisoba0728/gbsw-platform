import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SecretPanel } from "@/components/ui/secret-panel";

describe("SecretPanel", () => {
  it("문자열 값에는 무엇을 복사하는지 드러나는 버튼이 있다", () => {
    const html = renderToStaticMarkup(
      <SecretPanel label="가입코드" value="GBSW-TEST-CODE" />,
    );

    expect(html).toContain('aria-label="가입코드 복사"');
    expect(html).toContain(">복사</button>");
  });

  it("문자열이 아닌 표시값에는 잘못된 복사 버튼을 만들지 않는다", () => {
    const html = renderToStaticMarkup(
      <SecretPanel label="값" value={<span>여러 조각</span>} />,
    );

    expect(html).not.toContain("<button");
  });
});
