import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **페이지 본문의 폭은 `pageClass()` 하나가 정한다.**
 *
 * 화면마다 `max-w-*`를 손으로 적으면 값이 갈린다 — 실제로 2xl·3xl·4xl·5xl·6xl·7xl
 * 여섯 가지가 스무 곳에 흩어져 있었고, 짝이 되는 `loading.tsx`가 같은 값을 한 번
 * 더 적고 있어 둘이 어긋나면 뼈대에서 내용으로 넘어갈 때 폭이 튀었다.
 * `truncation.test.ts`와 같은 방식으로 소스를 직접 읽어 검사한다 — 규칙을 글로만
 * 적어 두면 새 화면이 조용히 빠져나간다.
 *
 * 카드·입력칸처럼 **페이지 안쪽 요소**의 폭까지 막지는 않는다. 여기서 잡는 것은
 * `mx-auto`와 함께 서는 바깥 껍데기뿐이다.
 */

/** 가운데로 모으는 바깥 껍데기. `mx-auto`와 `max-w-*`가 같은 클래스 문자열에 있다. */
const PAGE_SHELL =
  /"[^"]*\bmx-auto\b[^"]*\bmax-w-|"[^"]*\bmax-w-[^"]*\bmx-auto\b/;

/**
 * 껍데기를 손으로 적어도 되는 파일. **이유를 한 줄로 적는다** — 이유를 적을 수
 * 없으면 그 자리는 예외가 아니라 빠뜨린 것이다.
 */
const ALLOWED: Record<string, string> = {
  "src/components/ui/page-shell.tsx":
    "규칙을 구현하는 파일이다 — 세 폭을 정하는 것이 여기다.",
  "src/app/(app)/error.tsx":
    "화면 한가운데 서는 420px짜리 안내다. 페이지 본문이 아니라 대체 화면이라 세 폭과 무관하다.",
  "src/app/(app)/not-found.tsx":
    "화면 한가운데 서는 420px짜리 안내다. 페이지 본문이 아니라 대체 화면이라 세 폭과 무관하다.",
  "src/app/(app)/merit/error.tsx": "위와 같은 420px 안내다.",
  "src/app/(app)/pass/error.tsx": "위와 같은 420px 안내다.",
  "src/app/(app)/students/[studentId]/print/page.tsx":
    "인쇄용 확인서다. 폭이 화면이 아니라 A4 한 장에 맞춰져 있어 화면용 세 폭과 무관하다.",
  "src/app/scan/page.tsx":
    "앱 셸 밖의 정문 판독 화면이다. 폰 한 손에 맞춘 max-w-md 한 장이 화면 전체이므로 본문 폭 개념이 없다.",
  "src/app/(app)/parent-invite/page.tsx":
    "페이지 껍데기는 pageClass를 쓴다. 걸리는 max-w-xl은 카드 안쪽의 폼 한 칸이다.",
};


function repoPath(file: string): string {
  return relative(process.cwd(), file).split(sep).join("/");
}

/** `src/app` 아래의 화면 파일. 생성물은 우리 코드가 아니다. */
function appFiles(): string[] {
  return readdirSync(join(process.cwd(), "src"), {
    withFileTypes: true,
    recursive: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => repoPath(join(entry.parentPath, entry.name)))
    .filter((file) => !file.startsWith("src/generated/"))
    .sort();
}

const files = appFiles();
const handWritten = files.filter((file) =>
  PAGE_SHELL.test(readFileSync(file, "utf8")),
);

describe("페이지 폭은 pageClass가 정한다", () => {
  // 훑기가 조용히 빈 목록을 내면 아래 검사가 통째로 사라진다.
  it("src의 화면 파일을 실제로 읽는다", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain("src/components/ui/page-shell.tsx");
  });

  it("mx-auto max-w-* 껍데기를 손으로 적지 않는다", () => {
    const offenders = handWritten.filter((file) => !(file in ALLOWED));

    // 걸렸다면 둘 중 하나다 — `pageClass("form" | "page" | "wide")`로 바꾸거나,
    // 바꾸지 않을 이유를 위 ALLOWED에 한 줄로 적는다.
    expect(offenders).toEqual([]);
  });

  it("예외 목록에 죽은 줄이 없다", () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(existsSync(join(process.cwd(), file)), `${file}이 없다`).toBe(true);
      expect(reason.length, `${file}의 이유가 비었다`).toBeGreaterThan(10);
    }
    // page-shell.tsx는 규칙을 구현하는 파일이라 훑기에 안 걸릴 수 있다. 나머지는
    // 실제로 손으로 적고 있어야 한다 — 안 그러면 예외 줄이 죽은 채로 남는다.
    for (const file of Object.keys(ALLOWED)) {
      if (file === "src/components/ui/page-shell.tsx") continue;
      expect(handWritten, `${file}은 이제 껍데기를 손으로 적지 않는다`).toContain(file);
    }
  });
});
