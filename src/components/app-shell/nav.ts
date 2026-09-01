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

/*
 * Sidebar/BottomTab이 직접 import 한다. 서버 컴포넌트에서 props로 내려보내면
 * icon(함수)이 직렬화되지 않아 터진다. 실제 접근 통제는 서버가 한다.
 */

/** 하위 메뉴 한 줄. 아이콘 없이 들여쓴 링크로 나온다. */
export type NavChild = {
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
      // 교내·기숙사는 메뉴로 가르지 않는다 — 같은 화면이고, 화면 안의 탭이 고른다.
      // 다른 상벌점 화면(최근 부여·통계·규정)이 전부 그 방식이다.
      //
      // 첫 줄은 부모와 같은 경로다. 그래도 세우는 이유는, 묶음이 펼쳐졌을 때 나머지
      // 줄만 보이면 "부여는(내 점수는) 어디로 갔나"가 되기 때문이다. 역할마다 부르는
      // 말이 달라 세 줄로 나뉜다 — 교사는 부여하고, 학생은 자기 점수를, 학부모는
      // 자녀 점수를 본다.
      { href: "/merit", label: "상벌점 부여", roles: ["ADMIN"] },
      { href: "/merit", label: "내 상벌점", roles: ["STUDENT"] },
      { href: "/merit", label: "자녀 상벌점", roles: ["PARENT"] },
      { href: "/merit/recent", label: "최근 부여", roles: ["ADMIN"] },
      // 개요·순위·교사별·규정별은 메뉴로 가르지 않는다 — 같은 조회 조건을 쓰는
      // 같은 자료의 다른 각도라, 화면 안의 갈래 탭(`?view=`)이 고른다.
      { href: "/merit/stats", label: "통계", roles: ["ADMIN"] },
      // 규정은 두 화면이다. 자료는 같고 고칠 수 있는가가 다르다 — 권한도 서비스
      // 함수도 따로다(`merit:rule:read` ↔ `merit:rule:manage`). 교사에게 둘 다
      // 세우지 않는 이유는, 관리 화면이 읽기 화면을 그대로 품고 있어서다.
      { href: "/admin/merit/rules", label: "규정 관리", roles: ["ADMIN"] },
      { href: "/merit/rules", label: "규정", roles: ["STUDENT", "PARENT"] },
    ],
  },
  {
    // 세 역할이 같은 주소를 쓰고 화면이 역할로 갈린다 — 학생은 신청과 내 목록,
    // 교사는 결재, 학부모는 동의다. QR은 목록에서 한 건을 골라야 뜬다
    // (`/pass/{id}`).
    href: "/pass",
    label: "출입증",
    icon: QrIcon,
    children: [
      // 상벌점과 같은 이유로 부모와 같은 경로를 한 줄 세운다 — 펼쳤을 때
      // 나머지만 보이면 "결재는 어디로 갔나"가 된다. 교사 전용이라, 학생·학부모
      // 에게는 하위 메뉴가 하나도 없어 「출입증」이 평범한 링크로 그려진다.
      { href: "/pass", label: "결재·부여", roles: ["ADMIN"] },
      { href: "/pass/history", label: "전체 내역", roles: ["ADMIN"] },
    ],
  },
  // 판독(`/scan`)은 메뉴에 없다. 출입증 화면의 「스캔」 버튼으로 들어간다 —
  // 앱 셸 밖에 사는 화면이라 메뉴에서 나가면 사이드바가 사라지고, 최상위 한
  // 줄을 그것에 내주기에는 하루에 몇 번 쓰지 않는 사람이 더 많다.
  {
    // 세 역할이 같은 주소를 쓰고, 무엇이 보이는지는 게시판마다 다르다 —
    // 읽을 수 있는 게시판만 목록에 나온다. 하위 메뉴에 게시판을 늘어놓지
    // 않는 이유는 이 파일이 클라이언트 컴포넌트가 직접 import하는 정적
    // 모듈이라 DB를 못 읽어서다. 목록은 /community 화면이 낸다.
    href: "/community",
    label: "커뮤니티",
    icon: BoardIcon,
    children: [
      // 상벌점의 「규정」↔「규정 관리」와 같은 모양이다. 첫 줄이 부모와 같은
      // 경로인 것도 같은 이유 — 펼쳤을 때 관리 줄만 보이면 「게시판은 어디
      // 갔나」가 된다. 학생·학부모에게는 하위가 없어 평범한 링크로 그려진다.
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

/** 교사 섹션. 비어 있으면 섹션 자체가 렌더링되지 않는다. */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    // 계정·초대·학생은 메뉴로 가르지 않는다 — 초대가 계정이 되고 그 계정에
    // 학급·번호가 붙는 한 흐름이라, 어느 각도로 볼지는 화면 안의 탭(`?tab=`)이 고른다.
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

/**
 * 하단 탭에 세울 항목. 교사에게 NAV_ITEMS는 대시보드·상벌점·출입증·커뮤니티
 * 넷이고 (학부모 초대는 학생 전용), 여기에 「최근 부여」를 더해 다섯이 된다.
 * 학생도 다섯(넷 + 학부모 초대), 학부모는 넷이다.
 *
 * **다섯이 상한이고 지금 그 상한에 닿아 있다.** 320px 폰에서 한 칸이 61px이고
 * 가장 긴 라벨이 네 글자(「대시보드」·「커뮤니티」 48px)라 아직 들어간다 —
 * **다음 최상위 메뉴를 세우는 사람은 이 함수가 무엇을 뺄지 고르는 일부터
 * 해야 한다.**
 *
 * 「최근 부여」는 NAV_ITEMS 어디에도 없는데 여기서만 붙는다. 점호 직후 잘못 준
 * 것을 되돌리는 화면이라 폰에서 쓰는데, 빼면 서랍을 열고 목록을 훑어야 닿는다.
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

/**
 * 메뉴에 없는 화면의 상단바 제목.
 *
 * 학생 상세(`/students/<id>`)는 상벌점·출입증·학생 정보를 한 자리에 모은 화면이라
 * 어느 메뉴 한 줄에도 매달 수 없다 — 그렇다고 제목이 시스템 이름으로 떨어지면
 * 그 화면만 이름 없는 화면이 된다. 메뉴가 아니므로 `NAV_ITEMS`에 넣지 않는다
 * (넣으면 사이드바에 눌러도 404가 나는 줄이 생긴다).
 */
const EXTRA_TITLES: { href: string; label: string }[] = [
  // 계정 관리 안에서 들어오지만 주소는 /admin/users 아래가 아니라서 별도로 잡는다.
  { href: "/admin/students/import", label: "명단 반영" },
  { href: "/students", label: "학생" },
];

/** 모든 메뉴(하위 포함)를 한 줄로 편다. 상단바 제목 찾기에 쓴다. */
function flatten(): { href: string; label: string }[] {
  const all: { href: string; label: string }[] = [...EXTRA_TITLES];
  for (const item of [...NAV_ITEMS, ...ADMIN_NAV_ITEMS]) {
    all.push({ href: item.href, label: item.label });
    for (const child of item.children ?? []) {
      all.push({ href: child.href, label: child.label });
    }
  }
  return all;
}

/** 현재 경로의 메뉴 이름. 상단바 제목으로 쓴다. 하위 메뉴까지 훑는다. */
export function titleForPath(pathname: string): string {
  // 경로가 같은 것이 둘 있으면(부모 「상벌점」과 하위 「상벌점 부여」가 둘 다 /merit이다)
  // 부모가 이긴다 — flatten이 부모를 먼저 담고 sort가 안정 정렬이라서다. 상단바 제목은
  // 역할을 모르는데 「상벌점 부여」는 교사의 말이라, 학생이 같은 주소에서 볼 제목으로는
  // 맞지 않는다.
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
  return (item.children ?? []).some((child) => isActive(pathname, child.href));
}

/**
 * 지금 켜야 할 하위 메뉴 하나. 여러 개가 걸리면 경로가 가장 긴 것이 이긴다 —
 * `/merit`와 `/merit/recent`는 둘 다 맞는다.
 */
export function activeChild(
  pathname: string,
  children: NavChild[],
): NavChild | null {
  const matched = children
    .filter((child) => isActive(pathname, child.href))
    .sort((a, b) => b.href.length - a.href.length);

  return matched[0] ?? null;
}
