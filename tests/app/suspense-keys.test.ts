import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src", "app");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith(".tsx") ? [full] : [];
  });
}

const files = walk(ROOT);

describe("형제 Suspense 경계의 key", () => {
  it("훑기가 실제로 파일을 찾는다", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("맨 key={boundaryKey}를 쓰는 화면이 없다", () => {
    const offenders = files
      .filter((file) => readFileSync(file, "utf8").includes("key={boundaryKey}"))
      .map((file) => file.slice(process.cwd().length + 1));

    expect(offenders).toEqual([]);
  });
});
