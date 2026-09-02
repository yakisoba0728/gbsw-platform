import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const TRUNCATING = /\btruncate\b|\btext-ellipsis\b|\bline-clamp-/;

const IMPORTS_TRUNCATED_TEXT = /from "@\/components\/ui\/truncated-text"/;

const ALLOWED: Record<string, string> = {
  "src/components/ui/truncated-text.tsx":
    "규칙을 구현하는 파일이다 — 자르는 것도 말풍선을 띄우는 것도 여기가 한다.",
  "src/components/merit/charts.tsx":
    "차트 축 라벨. 같은 줄을 덮는 Tooltip이 이미 전문을 띄운다 — 겹쳐 달면 말풍선이 둘이 된다.",
  "src/app/(app)/merit/stats/views/teacher-chart.tsx":
    "차트 축 라벨. 같은 줄을 덮는 Tooltip이 이미 전문을 띄운다 — 겹쳐 달면 말풍선이 둘이 된다.",
  "src/components/merit/rule-picker.tsx":
    "닫힌 칸 위에 겹쳐 그리는 덮개다. pointer-events-none이라 마우스가 닿지 않고, 목록을 열면 전문이 잘리지 않은 채로 선다.",
};

function repoPath(file: string): string {
  return relative(process.cwd(), file).split(sep).join("/");
}

function screenFiles(): string[] {
  return readdirSync(join(process.cwd(), "src"), {
    withFileTypes: true,
    recursive: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => repoPath(join(entry.parentPath, entry.name)))
    .filter((file) => !file.startsWith("src/generated/"))
    .sort();
}

const files = screenFiles();
const truncating = files.filter((file) =>
  TRUNCATING.test(readFileSync(file, "utf8")),
);

describe("잘린 글에는 전문을 볼 길이 있다", () => {
  it("src의 화면 파일을 실제로 읽는다", () => {
    expect(truncating).toContain("src/components/ui/truncated-text.tsx");
  });

  it("자르는 파일은 TruncatedText를 들여온다", () => {
    const missing = truncating
      .filter((file) => !(file in ALLOWED))
      .filter((file) => !IMPORTS_TRUNCATED_TEXT.test(readFileSync(file, "utf8")));

    expect(missing).toEqual([]);
  });

  it("예외 목록에 죽은 줄이 없다", () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(existsSync(join(process.cwd(), file)), `${file}이 없다`).toBe(true);
      expect(truncating, `${file}은 이제 자르지 않는다`).toContain(file);
      expect(reason.length, `${file}의 이유가 비었다`).toBeGreaterThan(10);
    }
  });
});
