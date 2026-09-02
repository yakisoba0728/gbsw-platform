import { describe, expect, it } from "vitest";
import {
  classifyUpload,
  contentDisposition,
  newStorageKey,
  storagePath,
} from "@/modules/community/community.storage";

const MB = 1024 * 1024;

describe("classifyUpload", () => {
  it("허용 이미지는 인라인이다", () => {
    expect(classifyUpload("사진.png", 1000)).toEqual({
      ok: true,
      mimeType: "image/png",
      inline: true,
    });
  });

  it("PDF는 인라인이다 — 누르면 내려받지 않고 브라우저 뷰어가 연다", () => {
    expect(classifyUpload("보고서.pdf", 1000)).toEqual({
      ok: true,
      mimeType: "application/pdf",
      inline: true,
    });
  });

  it("한글·오피스 문서는 내려받기다 — 브라우저가 열 수 없다", () => {
    for (const name of ["가정통신문.hwp", "표.xlsx", "글.docx", "묶음.zip"]) {
      expect(classifyUpload(name, 1000)).toMatchObject({ inline: false });
    }
  });

  it("한글 문서(hwp·hwpx)를 받는다", () => {
    expect(classifyUpload("가정통신문.hwp", 1000).ok).toBe(true);
    expect(classifyUpload("가정통신문.hwpx", 1000).ok).toBe(true);
  });

  it("svg는 거부한다 — 같은 출처에서 열리면 스크립트가 돈다", () => {
    expect(classifyUpload("icon.svg", 100)).toEqual({
      ok: false,
      code: "ATTACHMENT_TYPE",
    });
  });

  it.each(["a.html", "a.htm", "a.js", "a.exe", "a.sh", "a"])(
    "%s는 거부한다",
    (name) => {
      expect(classifyUpload(name, 100).ok).toBe(false);
    },
  );

  it("확장자가 맞아도 20MB를 넘으면 거부한다", () => {
    expect(classifyUpload("큰파일.pdf", 20 * MB + 1)).toEqual({
      ok: false,
      code: "ATTACHMENT_TOO_LARGE",
    });
  });

  it("정확히 20MB는 통과한다", () => {
    expect(classifyUpload("딱맞음.pdf", 20 * MB).ok).toBe(true);
  });

  it("빈 파일은 거부한다", () => {
    expect(classifyUpload("빈.pdf", 0).ok).toBe(false);
  });

  it("타입은 확장자가 정한다", () => {
    expect(classifyUpload("보고서.pdf", 1000)).toEqual({
      ok: true,
      mimeType: "application/pdf",
      inline: true,
    });
  });

  it("대문자 확장자도 같다", () => {
    expect(classifyUpload("사진.PNG", 100)).toMatchObject({
      ok: true,
      inline: true,
    });
  });

  it("점이 여럿이면 마지막 것이 확장자다", () => {
    expect(classifyUpload("보고서.png.exe", 100).ok).toBe(false);
    expect(classifyUpload("2026.08.보고서.pdf", 100).ok).toBe(true);
  });
});

describe("newStorageKey", () => {
  it("32자 소문자 16진수다", () => {
    expect(newStorageKey()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("부를 때마다 다르다", () => {
    const keys = new Set(Array.from({ length: 100 }, () => newStorageKey()));
    expect(keys.size).toBe(100);
  });
});

describe("storagePath", () => {
  const at = new Date("2026-08-28T01:00:00.000Z");

  it("연·월로 나눠 담는다 — 한 디렉터리에 무한정 쌓이지 않게", () => {
    expect(storagePath("a".repeat(32), at)).toMatch(/\/2026\/08\/a{32}$/);
  });

  it("만들어진 키를 그대로 받는다", () => {
    expect(() => storagePath(newStorageKey(), at)).not.toThrow();
  });

  it.each([
    ["경로 탈출", "../../etc/passwd"],
    ["슬래시", "a/b"],
    ["짧은 것", "abc"],
    ["대문자", "A".repeat(32)],
    ["빈 것", ""],
    ["널바이트", "a".repeat(31) + "\0"],
  ])("%s 키는 던진다 — 파일 이름에 닿기 전에 막는다", (_label, key) => {
    expect(() => storagePath(key, at)).toThrow();
  });
});

describe("contentDisposition", () => {
  it("내려받기는 attachment다", () => {
    expect(contentDisposition("보고서.pdf", false)).toContain("attachment;");
  });

  it("이미지는 inline이다", () => {
    expect(contentDisposition("사진.png", true)).toContain("inline;");
  });

  it("한글 이름을 RFC 5987로 싣는다", () => {
    const value = contentDisposition("가정통신문.hwp", false);
    expect(value).toContain("filename*=UTF-8''");
    expect(value).toContain(encodeURIComponent("가정통신문.hwp"));
  });

  it("따옴표·줄바꿈이 헤더를 깨지 못한다", () => {
    const value = contentDisposition('a"b\r\nX-Evil: 1.pdf', false);
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    const ascii = value.slice(value.indexOf('filename="') + 10);
    expect(ascii.slice(0, ascii.indexOf('"'))).not.toContain('"');
  });
});
