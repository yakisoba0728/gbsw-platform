import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TruncatedText } from "@/components/ui/truncated-text";

describe("TruncatedText 접근성 마크업", () => {
  it("일반 사용처는 화면 글과 별도로 낭독기 전문을 제공한다", () => {
    const html = renderToStaticMarkup(
      <TruncatedText full="전체 문장">화면 문장</TruncatedText>,
    );

    expect(html).toContain("aria-hidden=\"true\"");
    expect(html).toContain("전체 문장");
    expect(html).toContain("화면 문장");
  });

  it("제목 모드는 동일 문자열을 DOM에 한 번만 둔다", () => {
    const html = renderToStaticMarkup(
      <h1>
        <TruncatedText full="출입증" screenReaderText="children">
          출입증
        </TruncatedText>
      </h1>,
    );

    expect(html.match(/출입증/g)).toHaveLength(1);
    expect(html).not.toContain("aria-hidden");
    expect(html).not.toContain("sr-only");
  });
});
