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
 * 이 설정은 Sidebar/BottomTab(클라이언트 컴포넌트)이 **직접 import** 한다.
 * 서버 컴포넌트에서 props로 내려보내면 icon(함수)이 직렬화되지 않아 터진다.
 *
 * 메뉴 목록이 클라이언트 번들에 포함되지만 비밀이 아니다 — 라벨과 경로뿐이고,
 * 실제 접근 통제는 각 페이지의 requireAuth/requirePermission이 서버에서 한다.
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
  /**
   * 사이드바에서 펼쳐지는 하위 메뉴. 바텀탭(모바일)은 무시하고 부모 링크만
   * 보여준다 — 좁은 화면에 하위 항목까지 넣으면 탭이 못 읽을 만큼 작아지고,
   * 화면 안의 트랙 탭이 같은 역할을 이미 한다.
   */
  children?: NavChild[];
};

/**
 * 사이드바 / 바텀탭 메뉴.
 *
 * 모듈이 하나 붙을 때마다 여기에 한 줄씩 추가한다 — 상벌점이 그 첫 사례다.
 * 아직 만들지 않은 화면은 링크가 깨지므로 미리 넣지 않는다.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "대시보드", icon: DashboardIcon },
  {
    href: "/merit",
    label: "상벌점",
    icon: MeritIcon,
    // roles를 비운다 — 학생·학부모·관리자가 모두 본다 (각자 보는 내용은 다르다).
    children: [
      // 교내가 기본 트랙이라 track 파라미터가 없는 /merit도 이 항목으로 친다
      // (isChildActive와 DEFAULT_PARAMS 참고).
      { href: "/merit?track=SCHOOL", label: "그린마일리지" },
      { href: "/merit?track=DORM", label: "기숙사 상벌점" },
      { href: "/merit/recent", label: "최근 부여", roles: ["ADMIN"] },
      { href: "/merit/stats", label: "통계", roles: ["ADMIN"] },
      { href: "/admin/merit/rules", label: "항목 관리", roles: ["ADMIN"] },
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
    label: "사용자 관리",
    // 학생 관리(UsersIcon: 사람)와 구분한다 — 이쪽은 계정 자체(활성/비활성·권한)를 다룬다.
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
    // 학교 전체에 한 번에 적용되는 수치를 모아 두는 자리. 지금은 벌점 기준
    // 하나뿐이라 하위 메뉴 없이 한 줄이다 — 항목이 늘면 그때 children을 연다.
    href: "/admin/settings",
    label: "설정",
    icon: SlidersIcon,
    roles: ["ADMIN"],
  },
];

export function visibleItems(items: NavItem[], role: Role | null): NavItem[] {
  return items.filter((item) => !item.roles || (role && item.roles.includes(role)));
}

/** 하위 메뉴도 역할로 거른다 — 학생에게 "항목 관리"가 보이면 눌러도 튕긴다. */
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

/**
 * 현재 경로에 해당하는 메뉴 이름 — 상단바 제목으로 쓴다.
 *
 * **하위 메뉴까지 훑는다.** 안 그러면 `/admin/merit/rules`처럼 부모와 경로가
 * 겹치지 않는 하위 화면에서 제목이 기본값("GBSW 통합관리시스템")으로 떨어진다.
 */
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

/**
 * 부모 메뉴가 활성인가. 하위 메뉴가 부모와 다른 경로에 있을 수 있어
 * (항목 관리 = `/admin/merit/rules`) 하위까지 함께 본다.
 */
export function isGroupActive(pathname: string, item: NavItem): boolean {
  if (isActive(pathname, item.href)) return true;
  return (item.children ?? []).some((child) => isActive(pathname, childPath(child)));
}

/**
 * 쿼리 파라미터가 없을 때 화면이 실제로 쓰는 기본값.
 * `/merit`의 track 기본값은 SCHOOL이다 (merit/page.tsx의 isMeritTrack 폴백).
 */
const DEFAULT_PARAMS: Record<string, string> = {
  track: "SCHOOL",
};

/**
 * 이 하위 메뉴가 현재 위치와 들어맞는가. **쿼리까지 본다** —
 * `/merit?track=SCHOOL`과 `/merit?track=DORM`은 경로가 같아서 pathname만 보면
 * 둘 다 걸린다.
 *
 * 파라미터가 아예 없으면 화면의 기본값이 쓰이므로, 기본값과 같은 항목만 맞다고
 * 본다 — 그래서 맨 처음 `/merit`으로 들어와도 그린마일리지가 걸린다.
 *
 * **여러 개가 동시에 맞을 수 있다** (`/merit/stats`는 `/merit`으로도 시작한다).
 * 화면에 하나만 켜려면 activeChild()를 쓴다.
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

/**
 * 지금 켜야 할 하위 메뉴 하나. 없으면 null.
 *
 * 여러 개가 걸리면 **경로가 가장 긴 것**이 이긴다 — `/merit/stats`에서는
 * 그린마일리지(`/merit`)와 통계(`/merit/stats`)가 둘 다 걸리는데, 통계 화면에서
 * 그린마일리지까지 강조되면 지금 어디에 있는지가 흐려진다. titleForPath가
 * 제목을 고르는 방식과 같은 규칙이다.
 */
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
