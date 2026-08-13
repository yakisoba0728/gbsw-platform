import type { ComponentType, SVGProps } from "react";
import {
  DashboardIcon,
  InviteIcon,
  LogIcon,
  SettingsIcon,
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
export type NavItem = {
  href: string;
  label: string;
  /** 모바일 바텀탭용 짧은 라벨. 없으면 label을 쓴다. */
  shortLabel?: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** 비우면 전체 역할에게 보인다. */
  roles?: Role[];
};

/**
 * 사이드바 / 바텀탭 메뉴.
 *
 * 모듈이 하나 붙을 때마다 여기에 한 줄씩 추가한다. 예를 들어 상벌점 모듈을
 * 만들면 아래를 넣으면 된다 (MeritIcon은 components/icons.tsx에 이미 있다):
 *
 *   { href: "/merit", label: "상벌점", icon: MeritIcon },
 *
 * 아직 만들지 않은 화면은 링크가 깨지므로 미리 넣지 않는다.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "대시보드", icon: DashboardIcon },
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
];

export function visibleItems(items: NavItem[], role: Role | null): NavItem[] {
  return items.filter((item) => !item.roles || (role && item.roles.includes(role)));
}

/** 현재 경로에 해당하는 메뉴 이름 — 상단바 제목으로 쓴다. */
export function titleForPath(pathname: string): string {
  const match = [...NAV_ITEMS, ...ADMIN_NAV_ITEMS]
    .filter((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return match?.label ?? "GBSW 통합관리시스템";
}

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
