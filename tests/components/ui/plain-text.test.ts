import { describe, expect, it } from "vitest";
import { splitLinks } from "@/components/ui/plain-text";

/** 링크 조각만 뽑는다. 테스트가 읽기 쉬워진다. */
function links(text: string): string[] {
  return splitLinks(text)
    .filter((s) => s.href !== null)
    .map((s) => s.href as string);
}

/** 조각을 다시 이으면 원문이어야 한다 — 글자를 잃지 않는다는 뜻이다. */
function rejoin(text: string): string {
  return splitLinks(text)
    .map((s) => s.text)
    .join("");
}

describe("splitLinks — 찾는다", () => {
  it("http·https 주소를 찾는다", () => {
    expect(links("https://gbsw.hs.kr 참고")).toEqual(["https://gbsw.hs.kr"]);
    expect(links("http://a.kr/b")).toEqual(["http://a.kr/b"]);
  });

  it("한 줄에 여럿도 찾는다", () => {
    expect(links("https://a.kr 와 https://b.kr")).toEqual([
      "https://a.kr",
      "https://b.kr",
    ]);
  });

  it("줄바꿈을 사이에 두고도 찾는다", () => {
    expect(links("첫 줄\nhttps://a.kr/x\n끝")).toEqual(["https://a.kr/x"]);
  });

  it("주소가 없으면 링크가 없다", () => {
    expect(links("그냥 글입니다. 소등 시간이 이릅니다.")).toEqual([]);
  });
});

describe("splitLinks — 안 찾는다", () => {
  it.each([
    ["javascript: 스킴", "javascript:alert(1)"],
    ["data: 스킴", "data:text/html,<script>alert(1)</script>"],
    ["file: 스킴", "file:///etc/passwd"],
    ["스킴만", "https://"],
    ["스킴과 슬래시만", "https:///"],
    ["스킴 없는 도메인", "gbsw.hs.kr"],
    ["www만", "www.gbsw.hs.kr"],
  ])("%s는 링크로 만들지 않는다", (_label, text) => {
    expect(links(text)).toEqual([]);
  });

  it("**대문자 스킴도 안 만든다** — 정규식이 소문자만 본다", () => {
    expect(links("JAVASCRIPT:alert(1)")).toEqual([]);
  });
});

describe("splitLinks — 끝을 다듬는다", () => {
  it.each([
    ["마침표", "자세한 것은 https://a.kr/b 를 보세요.", "https://a.kr/b"],
    ["문장 끝 마침표", "https://a.kr/b.", "https://a.kr/b"],
    ["쉼표", "https://a.kr/b, 그리고", "https://a.kr/b"],
    ["물음표", "https://a.kr/b?", "https://a.kr/b"],
    ["느낌표 여럿", "https://a.kr/b!!!", "https://a.kr/b"],
  ])("%s를 뗀다", (_label, text, expected) => {
    expect(links(text)).toEqual([expected]);
  });

  it("괄호로 감싼 주소에서 닫는 괄호를 뗀다", () => {
    expect(links("(https://a.kr/b)")).toEqual(["https://a.kr/b"]);
  });

  it("**주소 안의 괄호는 남긴다** — 위키 주소가 그렇다", () => {
    expect(links("https://ko.wikipedia.org/wiki/한글_(문서)")).toEqual([
      "https://ko.wikipedia.org/wiki/한글_(문서)",
    ]);
  });

  it("쿼리스트링과 앵커를 살린다", () => {
    expect(links("https://a.kr/b?x=1&y=2#c 끝")).toEqual(["https://a.kr/b?x=1&y=2#c"]);
  });
});

describe("splitLinks — 글자를 잃지 않는다", () => {
  it.each([
    "그냥 글",
    "https://a.kr",
    "앞 https://a.kr 뒤",
    "자세한 것은 https://a.kr/b 를 보세요.",
    "(https://a.kr/b)",
    "https://a.kr 와 https://b.kr",
    "첫 줄\n\nhttps://a.kr/x\n끝",
    "",
  ])("이어 붙이면 원문이다: %j", (text) => {
    expect(rejoin(text)).toBe(text);
  });
});
