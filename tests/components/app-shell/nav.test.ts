import { describe, expect, it } from "vitest";
import {
  activeChild,
  ADMIN_NAV_ITEMS,
  isGroupActive,
  NAV_ITEMS,
  titleForPath,
  visibleChildren,
  type NavItem,
} from "@/components/app-shell/nav";

const merit = NAV_ITEMS.find((item) => item.href === "/merit") as NavItem;
const q = (search: string) => new URLSearchParams(search);

const child = (label: string) =>
  merit.children!.find((c) => c.label === label)!;

describe("상벌점 메뉴 구성", () => {
  it("하위 메뉴 넷을 갖는다", () => {
    expect(merit.children?.map((c) => c.label)).toEqual([
      "그린마일리지",
      "기숙사 상벌점",
      "통계",
      "항목 관리",
    ]);
  });

  it("부모는 역할 제한이 없다 — 학생·학부모도 본다", () => {
    expect(merit.roles).toBeUndefined();
  });

  it("통계와 항목 관리는 관리자만 본다", () => {
    expect(visibleChildren(merit, "STUDENT").map((c) => c.label)).toEqual([
      "그린마일리지",
      "기숙사 상벌점",
    ]);
    expect(visibleChildren(merit, "PARENT").map((c) => c.label)).toEqual([
      "그린마일리지",
      "기숙사 상벌점",
    ]);
    expect(visibleChildren(merit, "ADMIN")).toHaveLength(4);
  });

  it("로그인 전(role null)에는 역할 제한이 걸린 하위 메뉴가 안 보인다", () => {
    expect(visibleChildren(merit, null).map((c) => c.label)).toEqual([
      "그린마일리지",
      "기숙사 상벌점",
    ]);
  });

  it("상벌점 규정이 관리자 섹션에서 빠졌다 — 하위 메뉴로 옮겼다", () => {
    expect(ADMIN_NAV_ITEMS.some((i) => i.href === "/admin/merit/rules")).toBe(false);
  });
});

describe("isGroupActive — 부모가 켜지는 조건", () => {
  it("본인 경로에서 켜진다", () => {
    expect(isGroupActive("/merit", merit)).toBe(true);
    expect(isGroupActive("/merit/students/abc", merit)).toBe(true);
  });

  it("하위 메뉴가 다른 경로에 있어도 켜진다 (항목 관리 = /admin/merit/rules)", () => {
    expect(isGroupActive("/admin/merit/rules", merit)).toBe(true);
  });

  it("상관없는 경로에서는 꺼진다", () => {
    expect(isGroupActive("/admin/students", merit)).toBe(false);
    expect(isGroupActive("/", merit)).toBe(false);
  });
});

describe("activeChild — 하나만 켜진다", () => {
  const all = merit.children!;
  const active = (path: string, search: string) =>
    activeChild(path, q(search), all)?.label ?? null;

  it("track이 맞는 항목만 켜진다 — 경로가 같아 pathname만으로는 못 가른다", () => {
    expect(active("/merit", "track=DORM")).toBe("기숙사 상벌점");
    expect(active("/merit", "track=SCHOOL")).toBe("그린마일리지");
  });

  it("파라미터가 없으면 기본 트랙(교내)이 켜진다", () => {
    expect(active("/merit", "")).toBe("그린마일리지");
  });

  it("다른 쿼리가 섞여 있어도 track만 본다", () => {
    expect(active("/merit", "grade=2&classNo=3&track=DORM")).toBe("기숙사 상벌점");
    expect(active("/merit", "q=김민준")).toBe("그린마일리지");
  });

  it("학생 상세도 상위 트랙 항목을 켠다 — /merit 아래이기 때문이다", () => {
    expect(active("/merit/students/abc", "track=DORM")).toBe("기숙사 상벌점");
  });

  it("통계 화면에서는 통계만 켜진다 — /merit로도 시작하지만 더 긴 경로가 이긴다", () => {
    expect(active("/merit/stats", "")).toBe("통계");
    expect(active("/merit/stats", "track=DORM")).toBe("통계");
  });

  it("항목 관리 화면에서는 항목 관리만 켜진다", () => {
    expect(active("/admin/merit/rules", "")).toBe("항목 관리");
  });

  it("역할 때문에 안 보이는 항목은 켜질 수 없다", () => {
    // 학생 메뉴에는 통계가 아예 없다. 학생이 /merit/stats에 닿을 일도 없지만
    // (requirePermission이 /forbidden으로 보낸다), 닿더라도 통계가 켜지지는 않는다 —
    // /merit로 시작하니 그린마일리지가 켜질 뿐이다.
    const studentChildren = visibleChildren(merit, "STUDENT");
    expect(activeChild("/merit/stats", q(""), studentChildren)?.label).toBe(
      "그린마일리지",
    );
    expect(studentChildren.some((c) => c.label === "통계")).toBe(false);
  });

  it("상관없는 경로에서는 아무것도 안 켜진다", () => {
    expect(active("/admin/students", "")).toBeNull();
  });
});

describe("titleForPath — 하위 메뉴까지 훑는다", () => {
  it("하위 메뉴 화면에서 기본값으로 떨어지지 않는다", () => {
    expect(titleForPath("/admin/merit/rules")).toBe("항목 관리");
    expect(titleForPath("/merit/stats")).toBe("통계");
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

  it("모르는 경로는 시스템 이름으로 떨어진다", () => {
    expect(titleForPath("/없는경로")).toBe("GBSW 통합관리시스템");
  });
});

describe("메뉴 링크가 실제 화면을 가리킨다", () => {
  /**
   * 없는 화면을 메뉴에 넣으면 눌렀을 때 404가 난다 (nav.ts 주석의 규칙).
   * 라우트 파일이 실제로 있는지 확인한다.
   */
  it.each([
    ["/merit", "src/app/(app)/merit/page.tsx"],
    ["/merit/stats", "src/app/(app)/merit/stats/page.tsx"],
    ["/admin/merit/rules", "src/app/(app)/admin/merit/rules/page.tsx"],
  ])("%s → %s", async (_href, file) => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(existsSync(join(process.cwd(), file))).toBe(true);
  });
});
