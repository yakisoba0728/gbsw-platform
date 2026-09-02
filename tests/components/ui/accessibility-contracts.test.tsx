import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AttachmentPicker } from "@/app/(app)/community/[slug]/attachment-picker";
import { StudentPicker } from "@/components/students/student-picker";
import { Label } from "@/components/ui/input";

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((part) => channel(Number.parseInt(part, 16)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function cssColor(name: string): string {
  const css = readFileSync("src/app/globals.css", "utf8");
  const value = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
  if (!value) throw new Error(`${name} 색상 토큰을 찾지 못했습니다.`);
  return value;
}

describe("공용 UI 접근성 계약", () => {
  it.each(["mut2", "placeholder"])(
    "%s 텍스트는 흰 배경에서 WCAG AA 명암비를 충족한다",
    (token) => {
      expect(contrast(cssColor(token), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("학생 선택 버튼은 화면에 보이는 라벨과 연결된다", () => {
    const html = renderToStaticMarkup(
      <>
        <Label htmlFor="student-picker">학생</Label>
        <StudentPicker id="student-picker" students={[]} name="studentId" />
      </>,
    );

    expect(html).toMatch(/<label[^>]*for="student-picker"/);
    expect(html).toMatch(/<button[^>]*id="student-picker"/);
  });

  it("파일 입력은 화면에 보이는 라벨과 연결된다", () => {
    const html = renderToStaticMarkup(
      <>
        <Label htmlFor="post-files">첨부파일</Label>
        <AttachmentPicker id="post-files" slug="notice" max={3} />
      </>,
    );

    expect(html).toMatch(/<label[^>]*for="post-files"/);
    expect(html).toMatch(/<input[^>]*id="post-files"[^>]*type="file"/);
  });
});
