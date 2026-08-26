import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **글이 `…`로 잘리는 자리에는 전문을 볼 길이 있어야 한다.**
 *
 * `TruncatedText`가 그 일을 한다 — 실제로 잘렸을 때만 말풍선을 띄우고, 마우스가
 * 없어도 초점으로 열리며, 낭독기에는 전문을 따로 읽어 준다. 규칙을 글로만 적어
 * 두면 새 화면이 조용히 빠져나가므로(실제로 22곳 중 20곳이 빠져 있었다) 소스를
 * 직접 읽어서 검사한다. `nav.test.ts`가 메뉴 링크의 라우트 파일을 확인하는 것과
 * 같은 방식이다.
 *
 * 검사는 파일 단위다 — 한 파일 안에서 어느 `truncate`가 어느 `TruncatedText`와
 * 짝인지까지는 소스만 읽어서 가릴 수 없다. 임포트가 있으면 통과시키고, 짝이
 * 맞는지는 사람이 본다. 그래도 **아무것도 모르는 새 파일은 반드시 걸린다.**
 */

/** Tailwind에서 글을 자르는 클래스. `truncate`는 뒤 둘을 합친 것이다. */
const TRUNCATING = /\btruncate\b|\btext-ellipsis\b|\bline-clamp-/;

/** `TruncatedText`를 들여오는 줄. */
const IMPORTS_TRUNCATED_TEXT = /from "@\/components\/ui\/truncated-text"/;

/**
 * 자르면서 `TruncatedText`를 쓰지 않아도 되는 파일. **줄일 이유를 한 줄로 적는다** —
 * 이유를 적을 수 없으면 그 자리는 예외가 아니라 빠뜨린 것이다.
 */
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

/** 저장소 기준 경로. 윈도우에서도 목록의 표기와 맞도록 `/`로 고른다. */
function repoPath(file: string): string {
  return relative(process.cwd(), file).split(sep).join("/");
}

/** `src/` 아래의 모든 화면 파일. 생성물(`src/generated`)은 우리 코드가 아니다. */
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
  // 훑기가 조용히 빈 목록을 내면 아래 검사가 통째로 사라진다 — 아무것도 안 읽고
  // 통과하는 테스트가 가장 나쁜 종류다.
  it("src의 화면 파일을 실제로 읽는다", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain("src/components/ui/truncated-text.tsx");
    expect(truncating.length).toBeGreaterThan(5);
  });

  it("자르는 파일은 TruncatedText를 들여온다", () => {
    const missing = truncating
      .filter((file) => !(file in ALLOWED))
      .filter((file) => !IMPORTS_TRUNCATED_TEXT.test(readFileSync(file, "utf8")));

    // 걸렸다면 둘 중 하나다 — 그 자리를 TruncatedText로 바꾸거나, 바꾸지 않을
    // 이유를 위 ALLOWED에 한 줄로 적는다.
    expect(missing).toEqual([]);
  });

  it("예외 목록에 죽은 줄이 없다", () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(existsSync(join(process.cwd(), file)), `${file}이 없다`).toBe(true);
      // 더 이상 자르지 않는 파일이 목록에 남아 있으면, 다음 사람이 그 파일에
      // 자르는 코드를 새로 넣어도 검사가 봐준다.
      expect(truncating, `${file}은 이제 자르지 않는다`).toContain(file);
      expect(reason.length, `${file}의 이유가 비었다`).toBeGreaterThan(10);
    }
  });
});
