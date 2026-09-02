import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/ui/markdown";

/**
 * 마크다운은 이 저장소가 한 번 배제했다가 되돌린 결정이다. 배제한 근거는
 * **「서식을 넣으면 HTML 살균이 이 모듈에서 가장 위험한 코드가 된다」**였으므로,
 * 그 위험이 실제로 막혀 있는지를 여기서 붙든다.
 *
 * `renderToStaticMarkup`으로 서버가 실제로 내보내는 HTML을 보고 검사한다 —
 * 컴포넌트 트리를 들여다보면 살균 뒤의 결과를 못 본다.
 */
function html(markdown: string): string {
  return renderToStaticMarkup(<Markdown>{markdown}</Markdown>);
}

describe("Markdown — 문법이 실제로 동작한다", () => {
  it("굵게·기울임", () => {
    expect(html("**굵게** 와 *기울임*")).toContain("<strong>굵게</strong>");
    expect(html("**굵게** 와 *기울임*")).toContain("<em>기울임</em>");
  });

  it("목록", () => {
    const out = html("- 하나\n- 둘");
    expect(out).toContain("<ul");
    expect(out).toContain("<li>하나</li>");
  });

  it("번호 목록", () => {
    const out = html("1. 하나\n2. 둘");
    expect(out).toContain("<ol");
    expect(out).toContain("my-3 list-decimal space-y-1 pl-5");
  });

  it("체크리스트도 목록 여백·글머리표를 잃지 않는다", () => {
    const out = html("- [ ] 할 일\n- [x] 한 일");

    expect(out).toContain("my-3 list-disc space-y-1 pl-5");
    expect(out).toContain("contains-task-list");
  });

  it("제목은 h3부터 시작한다 — 페이지에 이미 h1·h2가 있다", () => {
    const out = html("# 제목");
    expect(out).toContain("<h3");
    expect(out).not.toContain("<h1");
  });

  it("인용과 구분선", () => {
    expect(html("> 인용")).toContain("<blockquote");
    expect(html("---")).toContain("<hr");
  });

  it("코드", () => {
    expect(html("`한 줄`")).toContain("<code");
    expect(html("```\n여러 줄\n```")).toContain("<pre");
  });

  it("언어가 붙은 코드 블록도 코드 디자인과 언어 class를 함께 가진다", () => {
    const out = html("```js\nconst answer = 42;\n```");

    expect(out).toContain("rounded-btn bg-soft px-1 py-0.5 text-caption");
    expect(out).toContain("language-js");
  });

  it("표 (GFM)", () => {
    const out = html("| 가 | 나 |\n|---|---|\n| 1 | 2 |");
    expect(out).toContain("<table");
    expect(out).toContain("<th");
  });

  it("링크는 새 탭에서 열리고 rel이 셋 다 붙는다", () => {
    const out = html("[학교](https://gbsw.hs.kr)");
    expect(out).toContain('href="https://gbsw.hs.kr"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("맨 주소도 링크가 된다 (GFM autolink)", () => {
    expect(html("https://gbsw.hs.kr 참고")).toContain('href="https://gbsw.hs.kr"');
  });
});

describe("Markdown — 위험한 것을 막는다", () => {
  it("**날 HTML을 그리지 않는다** — 태그는 사라지고 글자는 남는다", () => {
    expect(html("<script>alert(1)</script>")).not.toContain("<script");
    // 태그만 없어지고 안의 글자는 살아남는다 — 글이 통째로 증발하지 않는다.
    expect(html("<b>안녕</b> 뒤에 글")).toContain("안녕 뒤에 글");
  });

  it("**코드로 감싸면 HTML이 글자 그대로 보인다** — 코드 얘기를 쓸 수 있다", () => {
    expect(html("```\n<script>alert(1)</script>\n```")).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(html("`<div>안녕</div>`")).toContain("&lt;div&gt;안녕&lt;/div&gt;");
  });

  it("내부 prop이 DOM으로 새지 않는다", () => {
    expect(html("# 제목\n\n- 하나\n\n| 가 |\n|---|\n| 1 |")).not.toContain("node=");
  });

  it.each([
    ["script", "<script>alert(1)</script>"],
    ["img onerror", '<img src=x onerror="alert(1)">'],
    ["iframe", '<iframe src="https://evil.kr"></iframe>'],
    ["svg", "<svg onload=alert(1)></svg>"],
    ["style", "<style>body{display:none}</style>"],
    ["form", '<form action="https://evil.kr"><input name="x"></form>'],
  ])("%s 태그가 HTML로 나가지 않는다", (_label, markdown) => {
    const out = html(markdown);
    for (const tag of ["<script", "<iframe", "<svg", "<style", "<form", "<input"]) {
      expect(out).not.toContain(tag);
    }
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("onload");
  });

  it.each([
    ["javascript:", "[누르지 마세요](javascript:alert(1))"],
    ["대문자 JavaScript:", "[누르지 마세요](JavaScript:alert(1))"],
    ["data:", "[누르지 마세요](data:text/html,<script>alert(1)</script>)"],
    ["vbscript:", "[누르지 마세요](vbscript:msgbox(1))"],
  ])("%s 링크는 href가 비워진다", (_label, markdown) => {
    const out = html(markdown);
    expect(out).not.toMatch(/href="\s*javascript:/i);
    expect(out).not.toMatch(/href="\s*data:/i);
    expect(out).not.toMatch(/href="\s*vbscript:/i);
  });

  it("**이미지 문법은 태그로 나가지 않는다** — 바깥 서버에 조회를 보내지 않는다", () => {
    const out = html("![사진](https://evil.kr/track.png)");
    expect(out).not.toContain("<img");
  });

  it("체크박스 목록의 input도 나가지 않는다", () => {
    const out = html("- [ ] 할 일\n- [x] 한 일");
    expect(out).not.toContain("<input");
    // 목록 자체는 그려진다.
    expect(out).toContain("<li");
  });
});

describe("Markdown — 평범한 글을 망치지 않는다", () => {
  it("서식이 없으면 그냥 문단이다", () => {
    const out = html("소등이 너무 이릅니다.\n\n시험 기간에는 늦춰 주세요.");
    expect(out).toContain("소등이 너무 이릅니다.");
    expect(out).toContain("시험 기간에는 늦춰 주세요.");
  });

  it("빈 글도 터지지 않는다", () => {
    expect(() => html("")).not.toThrow();
  });

  it("HTML로 읽힐 만한 글자를 안전하게 그린다", () => {
    const out = html("a < b 이고 b > c 입니다 & 그래서");
    expect(out).toContain("&lt;");
    expect(out).toContain("&amp;");
  });
});
