import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * **형제 Suspense 경계는 같은 key를 쓰면 안 된다.**
 *
 * 조회 조건이 바뀔 때 경계를 새로 만들려고 `key={boundaryKey}`를 다는데, 한 화면에
 * 그런 경계가 둘 이상 나란히 서면 React가 「Encountered two children with the same
 * key」로 경고한다. 자식이 뒤바뀌거나 빠질 수 있다는 뜻이라 무시할 경고가 아니다.
 *
 * 실제로 여섯 화면이 그랬다 — 최근 부여·출입증 내역·감사로그·학생 출입증 탭·
 * 규정 관리·내 상벌점. 고치는 법은 앞에 이름을 붙이는 것이다:
 * `key={`rows:${boundaryKey}`}`.
 *
 * 이 검사는 **맨 key(`key={boundaryKey}`)** 를 금지한다. 이름이 붙으면 통과한다.
 */

const ROOT = join(process.cwd(), "src", "app");

/** 갈래마다 return이라 한 번에 하나만 서는 화면. 형제가 아니므로 충돌하지 않는다. */
const ALLOWED = new Map<string, string>([
  [
    "src/app/(app)/merit/stats/page.tsx",
    "갈래(view)마다 따로 return하고 두 경계가 shell과 본문으로 부모가 갈린다",
  ],
]);

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
    // 빈 목록이면 아래 검사가 조용히 사라진다.
    expect(files.length).toBeGreaterThan(30);
  });

  it("맨 key={boundaryKey}를 쓰는 화면이 없다", () => {
    const offenders = files
      .filter((file) => readFileSync(file, "utf8").includes("key={boundaryKey}"))
      .map((file) => file.slice(process.cwd().length + 1))
      .filter((rel) => !ALLOWED.has(rel));

    expect(offenders).toEqual([]);
  });

  it("허용 목록에 죽은 항목이 없다", () => {
    for (const [rel] of ALLOWED) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      expect(source, `${rel}은 이제 맨 key를 쓰지 않는다`).toContain(
        "key={boundaryKey}",
      );
    }
  });
});
