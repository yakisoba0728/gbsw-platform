import type { ComponentType, SVGProps } from "react";
import {
  BoardIcon,
  DashboardIcon,
  LogIcon,
  MeritIcon,
  QrIcon,
  SlidersIcon,
  UsersIcon,
} from "@/components/icons";
import type { Role } from "@/core/authz/roles";

// 아이콘 함수를 서버 props로 보내지 않도록 클라이언트에서 직접 import한다.
export type NavChild = {
  href: string;
  label: string;
  roles?: Role[];
};

export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  roles?: Role[];
  children?: NavChild[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "대시보드", icon: DashboardIcon },
  {
    href: "/merit",
    label: "상벌점",
    icon: MeritIcon,
    children: [
      { href: "/merit", label: "상벌점 부여", roles: ["ADMIN"] },
      { href: "/merit", label: "내 상벌점", roles: ["STUDENT"] },
      { href: "/merit", label: "자녀 상벌점", roles: ["PARENT"] },
      { href: "/merit/recent", label: "최근 부여", roles: ["ADMIN"] },
      { href: "/merit/stats", label: "통계", roles: ["ADMIN"] },
      { href: "/admin/merit/rules", label: "규정 관리", roles: ["ADMIN"] },
      { href: "/merit/rules", label: "규정", roles: ["STUDENT", "PARENT"] },
    ],
  },
  {
    href: "/pass",
    label: "출입증",
    icon: QrIcon,
    children: [
      { href: "/pass", label: "결재·부여", roles: ["ADMIN"] },
      { href: "/pass/history", label: "전체 내역", roles: ["ADMIN"] },
    ],
  },
  {
    href: "/community",
    label: "커뮤니티",
    icon: BoardIcon,
    children: [
      { href: "/community", label: "게시판" },
      { href: "/admin/community", label: "커뮤니티 관리", roles: ["ADMIN"] },
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

export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    href: "/admin/users",
    label: "계정 관리",
    shortLabel: "계정",
    icon: UsersIcon,
    roles: ["ADMIN"],
  },
  {
    href: "/admin/logs",
    label: "감사로그",
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

export function visibleChildren(item: NavItem, role: Role | null): NavChild[] {
  return (item.children ?? []).filter(
    (child) => !child.roles || (role && child.roles.includes(role)),
  );
}

// 같은 경로에서는 부모 이름을 제목으로 쓴다.
const PAGE_TITLES: NavChild[] = [
  { href: "/admin/students/import", label: "명단 반영" },
  { href: "/students", label: "학생" },
  ...[...NAV_ITEMS, ...ADMIN_NAV_ITEMS].flatMap((item) => [
    item,
    ...(item.children ?? []),
  ]),
];

export function titleForPath(pathname: string): string {
  return activeChild(pathname, PAGE_TITLES)?.label ?? "GBSW 통합관리시스템";
}

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function isGroupActive(pathname: string, item: NavItem): boolean {
  if (isActive(pathname, item.href)) return true;
  return (item.children ?? []).some((child) => isActive(pathname, child.href));
}

export function activeChild(
  pathname: string,
  children: NavChild[],
): NavChild | null {
  return children.reduce<NavChild | null>((current, child) => {
    if (!isActive(pathname, child.href)) return current;
    return !current || child.href.length > current.href.length ? child : current;
  }, null);
}
