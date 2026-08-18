import type { ComponentType, SVGProps } from "react";
import {
  DashboardIcon,
  InviteIcon,
  LogIcon,
  MeritIcon,
  SettingsIcon,
  SlidersIcon,
  UsersIcon,
} from "@/components/icons";
import type { Role } from "@/core/authz/roles";

/*
 * Sidebar/BottomTab이 직접 import 한다. 서버 컴포넌트에서 props로 내려보내면
 * icon(함수)이 직렬화되지 않아 터진다. 실제 접근 통제는 서버가 한다.
 */

/** 하위 메뉴 한 줄. 아이콘 없이 들여쓴 링크로 나온다. */
export type NavChild = {
  /** 쿼리스트링을 포함할 수 있다 (예: `/merit?track=DORM`). */
  href: string;
  label: string;
  /** 비우면 부모가 보이는 모든 역할에게 보인다. */
  roles?: Role[];
};

export type NavItem = {
  href: string;
  label: string;
  /** 모바일 바텀탭용 짧은 라벨. 없으면 label을 쓴다. */
  shortLabel?: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** 비우면 전체 역할에게 보인다. */
  roles?: Role[];
  /** 사이드바에서 펼쳐지는 하위 메뉴. 바텀탭은 부모 링크만 보여준다. */
  children?: NavChild[];
};

/** 사이드바 / 바텀탭 메뉴. 모듈이 붙을 때마다 한 줄씩 추가한다. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "대시보드", icon: DashboardIcon },
  {
    href: "/merit",
    label: "상벌점",
    icon: MeritIcon,
    children: [
      { href: "/merit?track=SCHOOL", label: "그린마일리지" },
      { href: "/merit?track=DORM", label: "기숙사 상벌점" },
      { href: "/merit/recent", label: "최근 부여", roles: ["ADMIN"] },
      { href: "/merit/stats", label: "통계 개요", roles: ["ADMIN"] },
      { href: "/merit/stats/ranking", label: "순위 · 현황", roles: ["ADMIN"] },
      { href: "/merit/stats/teachers", label: "교사별", roles: ["ADMIN"] },
      { href: "/merit/stats/rules", label: "규정별", roles: ["ADMIN"] },
      { href: "/admin/merit/rules", label: "규정 관리", roles: ["ADMIN"] },
    ],
  },
  {
    href: "/parent-invite",
    label: "학부모 초대",
    shortLabel: "학부모",
    icon: UsersIcon,
    roles: ["STUDENT"],
  },
];

/** 관리자 섹션. 비어 있으면 섹션 자체가 렌더링되지 않는다. */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    href: "/admin/invites",
    label: "초대 관리",
    icon: InviteIcon,
    roles: ["ADMIN"],
  },
  {
    href: "/admin/students",
    label: "학생 관리",
    shortLabel: "학생",
    icon: UsersIcon,
    roles: ["ADMIN"],
  },
  {
    href: "/admin/users",
    label: "계정 관리",
    icon: SettingsIcon,
    roles: ["ADMIN"],
  },
  {
    href: "/admin/logs",
    label: "로그",
    icon: LogIcon,
    roles: ["ADMIN"],
  },
  {
    href: "/admin/settings",
    label: "설정",
    icon: SlidersIcon,
    roles: ["ADMIN"],
  },
];

/**
 * 하단 탭에 세울 항목. 관리자에게 NAV_ITEMS는 대시보드·상벌점 둘뿐이라
 * (학부모 초대는 학생 전용) 점호 직후 잘못 준 것을 되돌리는 화면이 서랍 안에만
 * 있게 된다. 그 하나를 탭으로 끌어올린다.
 */
export function bottomTabItems(role: Role | null): NavItem[] {
  const base = visibleItems(NAV_ITEMS, role);
  if (role !== "ADMIN") return base;
  return [
    ...base,
    { href: "/merit/recent", label: "최근 부여", shortLabel: "최근", icon: LogIcon },
  ];
}

export function visibleItems(items: NavItem[], role: Role | null): NavItem[] {
  return items.filter((item) => !item.roles || (role && item.roles.includes(role)));
}

/** 하위 메뉴도 역할로 거른다. */
export function visibleChildren(item: NavItem, role: Role | null): NavChild[] {
  return (item.children ?? []).filter(
    (child) => !child.roles || (role && child.roles.includes(role)),
  );
}

/** 모든 메뉴(하위 포함)를 한 줄로 편다. 상단바 제목 찾기에 쓴다. */
function flatten(): { href: string; label: string }[] {
  const all: { href: string; label: string }[] = [];
  for (const item of [...NAV_ITEMS, ...ADMIN_NAV_ITEMS]) {
    all.push({ href: item.href, label: item.label });
    for (const child of item.children ?? []) {
      // 하위 메뉴의 href에는 쿼리가 붙어 있다. 제목은 경로로만 찾으므로 떼어낸다.
      all.push({ href: childPath(child), label: child.label });
    }
  }
  return all;
}

/** 하위 메뉴 href에서 쿼리를 뗀 경로. */
function childPath(child: NavChild): string {
  return child.href.split("?")[0];
}

/** 현재 경로의 메뉴 이름. 상단바 제목으로 쓴다. 하위 메뉴까지 훑는다. */
export function titleForPath(pathname: string): string {
  const match = flatten()
    .filter((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  return match?.label ?? "GBSW 통합관리시스템";
}

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** 부모 메뉴가 활성인가. 하위 메뉴가 다른 경로에 있을 수 있어 함께 본다. */
export function isGroupActive(pathname: string, item: NavItem): boolean {
  if (isActive(pathname, item.href)) return true;
  return (item.children ?? []).some((child) => isActive(pathname, childPath(child)));
}

/** 쿼리가 없을 때 화면이 실제로 쓰는 기본값. */
const DEFAULT_PARAMS: Record<string, string> = {
  track: "SCHOOL",
};

/**
 * 이 하위 메뉴가 현재 위치와 들어맞는가. 쿼리까지 본다 — `?track=SCHOOL`과
 * `?track=DORM`은 경로가 같다. 여러 개가 동시에 맞을 수 있어 activeChild()가 하나를 고른다.
 */
function matchesChild(
  pathname: string,
  search: URLSearchParams,
  child: NavChild,
): boolean {
  const [path, query] = child.href.split("?");
  if (!isActive(pathname, path)) return false;
  if (!query) return true;

  for (const [key, value] of new URLSearchParams(query)) {
    const actual = search.get(key);
    if (actual === null) {
      if (value !== DEFAULT_PARAMS[key]) return false;
    } else if (actual !== value) {
      return false;
    }
  }
  return true;
}

/** 지금 켜야 할 하위 메뉴 하나. 여러 개가 걸리면 경로가 가장 긴 것이 이긴다. */
export function activeChild(
  pathname: string,
  search: URLSearchParams,
  children: NavChild[],
): NavChild | null {
  const matched = children
    .filter((child) => matchesChild(pathname, search, child))
    .sort((a, b) => childPath(b).length - childPath(a).length);

  return matched[0] ?? null;
}
