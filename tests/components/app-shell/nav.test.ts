import { describe, expect, it } from "vitest";
import {
  activeChild,
  ADMIN_NAV_ITEMS,
  bottomTabItems,
  isGroupActive,
  NAV_ITEMS,
  titleForPath,
  visibleChildren,
  type NavItem,
} from "@/components/app-shell/nav";

const merit = NAV_ITEMS.find((item) => item.href === "/merit") as NavItem;

describe("상벌점 메뉴 구성", () => {
  it("하위 메뉴 여섯을 갖는다 — 통계가 네 갈래다", () => {
    expect(merit.children?.map((c) => c.label)).toEqual([
      "최근 부여",
      "통계 개요",
      "순위 · 현황",
      "교사별",
      "규정별",
      "규정 관리",
    ]);
  });

  // 교내·기숙사는 같은 화면이고 화면 안의 탭이 고른다. 메뉴로 다시 가르면
  // 한 화면이 두 줄로 서고, 그걸 구분하려고 nav가 쿼리를 읽어야 한다.
  it("트랙은 메뉴로 가르지 않는다", () => {
    const hrefs = merit.children?.map((c) => c.href) ?? [];
    expect(hrefs.some((href) => href.includes("track="))).toBe(false);
    expect(hrefs).not.toContain("/merit");
  });

  it("어떤 하위 메뉴에도 쿼리가 붙지 않는다", () => {
    const all = [...NAV_ITEMS, ...ADMIN_NAV_ITEMS].flatMap((i) => i.children ?? []);
    expect(all.every((child) => !child.href.includes("?"))).toBe(true);
  });

  it("부모는 역할 제한이 없다 — 학생·학부모도 본다", () => {
    expect(merit.roles).toBeUndefined();
  });

  // 하위 메뉴가 전부 교사 전용이라 학생·학부모에게는 하나도 안 보인다.
  // Sidebar는 그때 그룹이 아니라 평범한 링크(/merit)로 그린다.
  it("학생·학부모에게는 하위 메뉴가 없다 — 부여 화면 하나로 간다", () => {
    expect(visibleChildren(merit, "STUDENT")).toEqual([]);
    expect(visibleChildren(merit, "PARENT")).toEqual([]);
    expect(visibleChildren(merit, "ADMIN")).toHaveLength(6);
  });

  it("로그인 전(role null)에도 하위 메뉴가 안 보인다", () => {
    expect(visibleChildren(merit, null)).toEqual([]);
  });

  it("상벌점 규정이 관리자 섹션에서 빠졌다 — 하위 메뉴로 옮겼다", () => {
    expect(ADMIN_NAV_ITEMS.some((i) => i.href === "/admin/merit/rules")).toBe(false);
  });
});

describe("설정 메뉴", () => {
  const settings = ADMIN_NAV_ITEMS.find((i) => i.href === "/admin/settings") as NavItem;

  it("관리자 섹션에 한 줄로 있다", () => {
    expect(settings).toBeDefined();
    expect(settings.label).toBe("설정");
  });

  it("관리자만 본다", () => {
    expect(settings.roles).toEqual(["ADMIN"]);
  });

  it("사용자 관리와 아이콘이 다르다 — 같은 섹션에서 같은 그림이 둘이면 못 가른다", () => {
    const users = ADMIN_NAV_ITEMS.find((i) => i.href === "/admin/users") as NavItem;
    expect(settings.icon).not.toBe(users.icon);
  });
});

describe("isGroupActive — 부모가 켜지는 조건", () => {
  it("본인 경로에서 켜진다", () => {
    expect(isGroupActive("/merit", merit)).toBe(true);
    expect(isGroupActive("/merit/students/abc", merit)).toBe(true);
  });

  it("하위 메뉴가 다른 경로에 있어도 켜진다 (규정 관리 = /admin/merit/rules)", () => {
    expect(isGroupActive("/admin/merit/rules", merit)).toBe(true);
  });

  it("상관없는 경로에서는 꺼진다", () => {
    expect(isGroupActive("/admin/students", merit)).toBe(false);
    expect(isGroupActive("/", merit)).toBe(false);
  });
});

describe("activeChild — 하나만 켜진다", () => {
  const all = merit.children!;
  const active = (path: string) => activeChild(path, all)?.label ?? null;

  it("부여 화면에서는 아무 하위 메뉴도 안 켜진다 — 부모 링크가 그 자리다", () => {
    expect(active("/merit")).toBeNull();
    expect(active("/merit/students/abc")).toBeNull();
  });

  it("통계 화면에서는 통계만 켜진다 — /merit로도 시작하지만 더 긴 경로가 이긴다", () => {
    expect(active("/merit/stats")).toBe("통계 개요");
  });

  it("통계 하위 화면은 개요가 아니라 자기 것이 켜진다 — 경로가 더 길다", () => {
    expect(active("/merit/stats/teachers")).toBe("교사별");
    expect(active("/merit/stats/ranking")).toBe("순위 · 현황");
    expect(active("/merit/stats/rules")).toBe("규정별");
  });

  it("최근 부여도 자기 것이 켜진다", () => {
    expect(active("/merit/recent")).toBe("최근 부여");
  });

  it("규정 관리 화면에서는 규정 관리만 켜진다", () => {
    expect(active("/admin/merit/rules")).toBe("규정 관리");
  });

  it("역할 때문에 안 보이는 항목은 켜질 수 없다", () => {
    // 학생 메뉴에는 하위 메뉴가 없다. /merit/stats에 닿을 일도 없지만
    // (requirePermission이 /forbidden으로 보낸다), 닿더라도 켤 것이 없다.
    expect(activeChild("/merit/stats", visibleChildren(merit, "STUDENT"))).toBeNull();
  });

  it("상관없는 경로에서는 아무것도 안 켜진다", () => {
    expect(active("/admin/students")).toBeNull();
  });
});

describe("titleForPath — 하위 메뉴까지 훑는다", () => {
  it("하위 메뉴 화면에서 기본값으로 떨어지지 않는다", () => {
    expect(titleForPath("/admin/merit/rules")).toBe("규정 관리");
    expect(titleForPath("/merit/stats")).toBe("통계 개요");
    expect(titleForPath("/merit/stats/teachers")).toBe("교사별");
    expect(titleForPath("/merit/stats/ranking")).toBe("순위 · 현황");
    // /admin/merit/rules와 경로가 안 겹쳐야 한다 — 겹치면 제목이 뒤바뀐다.
    expect(titleForPath("/merit/stats/rules")).toBe("규정별");
  });

  it("부모 화면은 부모 이름이 나온다", () => {
    expect(titleForPath("/merit")).toBe("상벌점");
    expect(titleForPath("/merit/students/abc")).toBe("상벌점");
  });

  it("기존 화면들의 제목이 그대로다", () => {
    expect(titleForPath("/")).toBe("대시보드");
    expect(titleForPath("/admin/students")).toBe("학생 관리");
    expect(titleForPath("/admin/logs")).toBe("로그");
  });

  it("설정 화면도 제목이 나온다", () => {
    expect(titleForPath("/admin/settings")).toBe("설정");
  });

  it("모르는 경로는 시스템 이름으로 떨어진다", () => {
    expect(titleForPath("/없는경로")).toBe("GBSW 통합관리시스템");
  });
});

describe("메뉴 링크가 실제 화면을 가리킨다", () => {
  /**
   * 없는 화면을 메뉴에 넣으면 눌렀을 때 404가 난다 (nav.ts 주석의 규칙).
   * 목록을 손으로 적으면 메뉴를 늘려도 검사가 늘지 않아 규칙을 강제하지 못한다 —
   * 그래서 자료구조에서 직접 편다. bottomTabItems까지 넣는 이유는 관리자 바텀탭에
   * NAV_ITEMS 어디에도 없는 「최근 부여」 한 줄을 덧붙이기 때문이다.
   */
  const navPaths = [
    ...new Set(
      [...NAV_ITEMS, ...ADMIN_NAV_ITEMS, ...bottomTabItems("ADMIN")]
        .flatMap((item) => [item.href, ...(item.children ?? []).map((c) => c.href)]),
    ),
  ];

  /** 앱 셸 라우트 그룹 `(app)` 아래에서 이 경로를 그리는 파일. */
  const pageFile = (path: string) =>
    path === "/" ? "src/app/(app)/page.tsx" : `src/app/(app)${path}/page.tsx`;

  it("펴는 코드가 하위 메뉴와 관리자 섹션까지 훑는다", () => {
    // 펴기가 조용히 빈 목록을 내면 아래 it.each가 통째로 사라진다 — 예전에 손으로
    // 적어 두었던 경로가 전부 자동 목록에 들어오는지로 그걸 막는다.
    expect(navPaths).toEqual(
      expect.arrayContaining([
        "/",
        "/merit",
        "/merit/stats",
        "/merit/recent",
        "/admin/merit/rules",
        "/admin/settings",
      ]),
    );
  });

  it.each(navPaths)("%s → 라우트 파일이 있다", async (path) => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(existsSync(join(process.cwd(), pageFile(path)))).toBe(true);
  });
});
