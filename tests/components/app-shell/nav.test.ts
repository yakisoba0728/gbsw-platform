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
    // 세 줄이 같은 경로(/merit)를 가리키고 역할로 갈린다 — 부르는 말이 달라서다.
    // 묶음이 펼쳐졌을 때 첫 줄이 없으면 "내 점수는 어디로 갔나"가 된다.
    expect(visibleChildren(merit, "ADMIN")[0].label).toBe("상벌점 부여");
    expect(visibleChildren(merit, "STUDENT")[0].label).toBe("내 상벌점");
    expect(visibleChildren(merit, "PARENT")[0].label).toBe("자녀 상벌점");
    for (const role of ["ADMIN", "STUDENT", "PARENT"] as const) {
      expect(visibleChildren(merit, role)[0].href).toBe("/merit");
    }
  });

  // 개요·순위·교사별·규정별은 같은 조회 조건을 쓰는 같은 자료의 다른 각도라
  // 화면 안의 갈래 탭(?view=)이 고른다. 메뉴로 다시 가르면 트랙과 같은 실수가 된다.
  it("통계 갈래는 메뉴로 가르지 않는다", () => {
    const hrefs = merit.children?.map((c) => c.href) ?? [];
    expect(hrefs.filter((href) => href.startsWith("/merit/stats"))).toEqual([
      "/merit/stats",
    ]);
  });

  // 교내·기숙사는 같은 화면이고 화면 안의 탭이 고른다. 메뉴로 다시 가르면
  // 한 화면이 두 줄로 서고, 그걸 구분하려고 nav가 쿼리를 읽어야 한다.
  it("트랙은 메뉴로 가르지 않는다", () => {
    const hrefs = merit.children?.map((c) => c.href) ?? [];
    expect(hrefs.some((href) => href.includes("track="))).toBe(false);
    // **역할별로** 한 줄뿐이다 — 예전처럼 트랙별로 둘이 되면 안 된다. 표에는 세
    // 줄이 있지만 셋이 서로 다른 역할의 것이라 한 사람에게는 하나만 보인다.
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

  // 학생·학부모도 묶음으로 펼쳐진다 — 제 점수와 규정 둘이다. 교사에게는 넷.
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

  // 규정은 두 화면이고 한 사람에게는 하나만 보인다 — 교사는 고칠 수 있는 쪽,
  // 학생·학부모는 읽는 쪽이다. 둘이 함께 보이면 같은 말이 두 줄로 선다.
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

  // 출입증 화면의 「스캔」 버튼으로 들어간다. 최상위에도, 출입증 하위에도 없다 —
  // 하위에 두면 묶음을 펴야 닿고, 최상위는 하루에 몇 번 안 쓰는 사람에게 한 줄이
  // 통째로 나간다.
  it("최상위에도 하위에도 없다", () => {
    expect(NAV_ITEMS.some((item) => item.href === "/scan")).toBe(false);
    expect(pass.children?.some((child) => child.href === "/scan")).toBe(false);
  });

  // 메뉴에서 뺐다고 이름까지 없어지면 그 화면만 제목이 시스템 이름으로 떨어진다.
  it("상단바 제목은 그대로 나온다", () => {
    expect(titleForPath("/scan")).toBe("QR 스캔");
    // /pass와 경로가 안 겹친다 — 겹치면 제목이 뒤바뀐다.
    expect(titleForPath("/pass")).toBe("출입증");
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

  // 커뮤니티가 마지막 칸을 채웠다. 여섯 번째를 세우려면 무엇을 뺄지 골라야 한다.
  it("상한에 닿았지만 넘지는 않았다", () => {
    for (const role of ["ADMIN", "STUDENT", "PARENT"] as const) {
      expect(bottomTabItems(role).length).toBeLessThanOrEqual(5);
    }
  });

  // 320px 폰에서 한 칸이 61px이다. 네 글자(48px)까지가 들어가는 한계라,
  // 라벨이 길어지면 shortLabel을 붙여야 한다.
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
    // 학생 상세는 부여 화면에서 들어가는 곳이라 같은 줄이 켜진 채로 둔다.
    expect(active("/merit/students/abc")).toBe("상벌점 부여");
  });

  it("통계 화면에서는 통계만 켜진다 — /merit로도 시작하지만 더 긴 경로가 이긴다", () => {
    expect(active("/merit/stats")).toBe("통계");
  });

  // 갈래는 쿼리(?view=)로 고르므로 경로가 하나다 — 어느 갈래를 보고 있든
  // 켜지는 줄은 「통계」 하나여야 한다.
  it("갈래를 옮겨도 켜지는 줄은 통계 하나다", () => {
    expect(active("/merit/stats?view=teachers")).toBe("통계");
    expect(active("/merit/stats?view=ranking")).toBe("통계");
  });

  // 옛 주소는 리다이렉트로 남겨 뒀다. 잠깐 스치는 사이에도 엉뚱한 줄이 켜지면 안 된다.
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
    // 학생은 통계에 닿을 일이 없지만(requirePermission이 /forbidden으로 보낸다),
    // 닿더라도 「통계」가 켜지지는 않는다 — 그 줄이 학생 메뉴에 없어서다.
    const mine = visibleChildren(merit, "STUDENT");
    expect(activeChild("/merit/stats", mine)?.label).not.toBe("통계");
  });

  it("학생의 규정 화면에서는 규정만 켜진다", () => {
    // /merit도 startsWith로 걸리지만 경로가 긴 쪽이 이긴다.
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
    // 옛 주소(리다이렉트)에서도 상단바가 기본값으로 떨어지지 않는다.
    expect(titleForPath("/merit/stats/teachers")).toBe("통계");
    // /admin/merit/rules와 경로가 안 겹쳐야 한다 — 겹치면 제목이 뒤바뀐다.
    expect(titleForPath("/merit/stats/rules")).toBe("통계");
  });

  // /merit에는 부모(상벌점)와 하위(상벌점 부여)가 둘 다 걸린다. 상단바 제목은 역할을
  // 모르는데 「상벌점 부여」는 교사의 말이라, 학생이 같은 주소에서 볼 제목이 아니다.
  it("경로가 같으면 부모 이름이 이긴다", () => {
    expect(titleForPath("/merit")).toBe("상벌점");
    expect(titleForPath("/merit/students/abc")).toBe("상벌점");
  });

  it("기존 화면들의 제목이 그대로다", () => {
    expect(titleForPath("/")).toBe("대시보드");
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
  /**
   * 메뉴가 가리키는 라우트 파일의 후보들. 대부분 앱 셸(`(app)`) 안이지만
   * **전부는 아니다** — 출입증 판독(`/scan`)은 셸 밖에 산다(로그인 후 돌아올 주소를
   * 들고 가야 해서다). 그래서 셸 밖도 함께 본다: 예외 목록으로 빼면 그 항목의
   * 오타를 영영 못 잡는다.
   */
  const pageFiles = (path: string) =>
    path === "/"
      ? ["src/app/(app)/page.tsx"]
      : [`src/app/(app)${path}/page.tsx`, `src/app${path}/page.tsx`];

  it("펴는 코드가 하위 메뉴와 관리자 섹션까지 훑는다", () => {
    // 펴기가 조용히 빈 목록을 내면 아래 it.each가 통째로 사라진다 — 예전에 손으로
    // 적어 두었던 경로가 전부 자동 목록에 들어오는지로 그걸 막는다.
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
    // 어느 후보에도 없으면 메뉴가 404를 가리킨다.
    expect(found).not.toHaveLength(0);
  });
});
