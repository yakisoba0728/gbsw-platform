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
  it("역할마다 첫 줄이 제 화면이다", () => {
    expect(visibleChildren(merit, "ADMIN")[0].label).toBe("상벌점 부여");
    expect(visibleChildren(merit, "STUDENT")[0].label).toBe("내 상벌점");
    expect(visibleChildren(merit, "PARENT")[0].label).toBe("자녀 상벌점");
    for (const role of ["ADMIN", "STUDENT", "PARENT"] as const) {
      expect(visibleChildren(merit, role)[0].href).toBe("/merit");
    }
  });

  it("통계 갈래는 메뉴로 가르지 않는다", () => {
    const hrefs = merit.children?.map((c) => c.href) ?? [];
    expect(hrefs.filter((href) => href.startsWith("/merit/stats"))).toEqual([
      "/merit/stats",
    ]);
  });

  it("트랙은 메뉴로 가르지 않는다", () => {
    const hrefs = merit.children?.map((c) => c.href) ?? [];
    expect(hrefs.some((href) => href.includes("track="))).toBe(false);
    for (const role of ["ADMIN", "STUDENT", "PARENT"] as const) {
      const mine = visibleChildren(merit, role).map((c) => c.href);
      expect(mine.filter((href) => href === "/merit")).toHaveLength(1);
    }
  });

  it("어떤 하위 메뉴에도 쿼리가 붙지 않는다", () => {
    const all = [...NAV_ITEMS, ...ADMIN_NAV_ITEMS].flatMap((i) => i.children ?? []);
    expect(all.every((child) => !child.href.includes("?"))).toBe(true);
  });

  it("부모는 역할 제한이 없다 — 학생·학부모도 본다", () => {
    expect(merit.roles).toBeUndefined();
  });

  it("세 역할 모두 하위 메뉴를 갖는다", () => {
    expect(visibleChildren(merit, "STUDENT").map((c) => c.label)).toEqual([
      "내 상벌점",
      "규정",
    ]);
    expect(visibleChildren(merit, "PARENT").map((c) => c.label)).toEqual([
      "자녀 상벌점",
      "규정",
    ]);
    expect(visibleChildren(merit, "ADMIN").map((c) => c.label)).toEqual([
      "상벌점 부여",
      "최근 부여",
      "통계",
      "규정 관리",
    ]);
  });

  it("규정 줄은 역할마다 하나뿐이다", () => {
    for (const role of ["ADMIN", "STUDENT", "PARENT"] as const) {
      const rules = visibleChildren(merit, role).filter((c) =>
        c.href.endsWith("/merit/rules"),
      );
      expect(rules).toHaveLength(1);
    }
    expect(visibleChildren(merit, "ADMIN")[3].href).toBe("/admin/merit/rules");
    expect(visibleChildren(merit, "STUDENT")[1].href).toBe("/merit/rules");
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

describe("QR 스캔은 메뉴에 없다", () => {
  const pass = NAV_ITEMS.find((item) => item.href === "/pass") as NavItem;

  it("최상위에도 하위에도 없다", () => {
    expect(NAV_ITEMS.some((item) => item.href === "/scan")).toBe(false);
    expect(pass.children?.some((child) => child.href === "/scan")).toBe(false);
  });

});

describe("바텀탭 — 다섯 칸이 상한이다", () => {
  it("교사는 다섯이다 — 최상위 넷에 「최근 부여」 하나", () => {
    expect(bottomTabItems("ADMIN").map((item) => item.href)).toEqual([
      "/",
      "/merit",
      "/pass",
      "/community",
      "/merit/recent",
    ]);
  });

  it("학생도 다섯, 학부모는 넷이다", () => {
    expect(bottomTabItems("STUDENT")).toHaveLength(5);
    expect(bottomTabItems("PARENT")).toHaveLength(4);
  });

  it("상한에 닿았지만 넘지는 않았다", () => {
    for (const role of ["ADMIN", "STUDENT", "PARENT"] as const) {
      expect(bottomTabItems(role).length).toBeLessThanOrEqual(5);
    }
  });

  it("탭 라벨은 네 글자를 넘지 않는다", () => {
    for (const role of ["ADMIN", "STUDENT", "PARENT"] as const) {
      for (const item of bottomTabItems(role)) {
        expect((item.shortLabel ?? item.label).length).toBeLessThanOrEqual(4);
      }
    }
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

  it("부여 화면에서는 「상벌점 부여」가 켜진다", () => {
    expect(active("/merit")).toBe("상벌점 부여");
    expect(active("/merit/students/abc")).toBe("상벌점 부여");
  });

  it("통계 화면에서는 통계만 켜진다 — /merit로도 시작하지만 더 긴 경로가 이긴다", () => {
    expect(active("/merit/stats")).toBe("통계");
  });

  it("갈래를 옮겨도 켜지는 줄은 통계 하나다", () => {
    expect(active("/merit/stats?view=teachers")).toBe("통계");
    expect(active("/merit/stats?view=ranking")).toBe("통계");
  });

  it("옛 주소에서도 통계가 켜진다", () => {
    expect(active("/merit/stats/teachers")).toBe("통계");
    expect(active("/merit/stats/ranking")).toBe("통계");
    expect(active("/merit/stats/rules")).toBe("통계");
  });

  it("최근 부여도 자기 것이 켜진다", () => {
    expect(active("/merit/recent")).toBe("최근 부여");
  });

  it("규정 관리 화면에서는 규정 관리만 켜진다", () => {
    expect(active("/admin/merit/rules")).toBe("규정 관리");
  });

  it("역할 때문에 안 보이는 항목은 켜질 수 없다", () => {
    const mine = visibleChildren(merit, "STUDENT");
    expect(activeChild("/merit/stats", mine)?.label).not.toBe("통계");
  });

  it("학생의 규정 화면에서는 규정만 켜진다", () => {
    const mine = visibleChildren(merit, "STUDENT");
    expect(activeChild("/merit/rules", mine)?.label).toBe("규정");
    expect(activeChild("/merit", mine)?.label).toBe("내 상벌점");
  });

  it("상관없는 경로에서는 아무것도 안 켜진다", () => {
    expect(active("/admin/students")).toBeNull();
  });
});

describe("titleForPath — 하위 메뉴까지 훑는다", () => {
  it("하위 메뉴 화면에서 기본값으로 떨어지지 않는다", () => {
    expect(titleForPath("/admin/merit/rules")).toBe("규정 관리");
    expect(titleForPath("/merit/stats")).toBe("통계");
    expect(titleForPath("/merit/stats/teachers")).toBe("통계");
    expect(titleForPath("/merit/stats/rules")).toBe("통계");
  });

  it("경로가 같으면 부모 이름이 이긴다", () => {
    expect(titleForPath("/merit")).toBe("상벌점");
    expect(titleForPath("/merit/students/abc")).toBe("상벌점");
  });

  it("기존 화면들의 제목이 그대로다", () => {
    expect(titleForPath("/")).toBe("대시보드");
    expect(titleForPath("/pass")).toBe("출입증");
    expect(titleForPath("/admin/users")).toBe("계정 관리");
    expect(titleForPath("/admin/logs")).toBe("감사로그");
  });

  it("명단 반영처럼 메뉴 바깥의 관리자 화면도 정확한 제목을 쓴다", () => {
    expect(titleForPath("/admin/students/import")).toBe("명단 반영");
  });

  it("설정 화면도 제목이 나온다", () => {
    expect(titleForPath("/admin/settings")).toBe("설정");
  });

  it("모르는 경로는 시스템 이름으로 떨어진다", () => {
    expect(titleForPath("/없는경로")).toBe("GBSW 통합관리시스템");
  });
});

describe("메뉴 링크가 실제 화면을 가리킨다", () => {
  const navPaths = [
    ...new Set(
      [...NAV_ITEMS, ...ADMIN_NAV_ITEMS, ...bottomTabItems("ADMIN")]
        .flatMap((item) => [item.href, ...(item.children ?? []).map((c) => c.href)]),
    ),
  ];

  const pageFiles = (path: string) =>
    path === "/"
      ? ["src/app/(app)/page.tsx"]
      : [`src/app/(app)${path}/page.tsx`, `src/app${path}/page.tsx`];

  it("펴는 코드가 하위 메뉴와 관리자 섹션까지 훑는다", () => {
    expect(navPaths).toEqual(
      expect.arrayContaining([
        "/",
        "/merit",
        "/merit/stats",
        "/merit/recent",
        "/pass",
        "/pass/history",
        "/admin/merit/rules",
        "/admin/settings",
        "/community",
        "/admin/community",
      ]),
    );
  });

  it.each(navPaths)("%s → 라우트 파일이 있다", async (path) => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const found = pageFiles(path).filter((file) =>
      existsSync(join(process.cwd(), file)),
    );
    expect(found).not.toHaveLength(0);
  });
});
