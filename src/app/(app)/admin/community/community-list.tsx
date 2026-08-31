import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/table";
import { ROLE_LABELS, isRole } from "@/core/authz/roles";

export type ManagedBoard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  readRoles: string[];
  writeRoles: string[];
  anonymous: boolean;
  active: boolean;
};

/**
 * 역할 배열을 화면 글자로. **비어 있으면 「교사만」이다** — 교사는 늘 통과하므로
 * 빈 배열이 "아무도 못 본다"가 아니라 "교사만 본다"를 뜻한다. 그것을 화면이
 * 말하지 않으면 교사가 자기 게시판을 못 찾는다고 생각한다.
 */
function roleText(roles: string[]): string {
  if (roles.length === 0) return "교사만";
  return roles
    .filter(isRole)
    .map((role) => ROLE_LABELS[role])
    .join(" · ");
}

const COLUMNS: readonly Column<ManagedBoard>[] = [
  {
    key: "name",
    header: "이름",
    card: "title",
    cell: (board) => (
      <span className="flex items-center gap-1.5">
        <span className="font-medium text-ink">{board.name}</span>
        {board.anonymous && <Badge tone="info">익명</Badge>}
        {!board.active && <Badge tone="cancelled">제거됨</Badge>}
      </span>
    ),
  },
  {
    key: "slug",
    header: "주소",
    card: "meta",
    cell: (board) => <span className="text-mut">/community/{board.slug}</span>,
  },
  {
    key: "read",
    header: "읽기",
    card: "meta",
    cell: (board) => roleText(board.readRoles),
  },
  {
    key: "write",
    header: "글쓰기",
    card: "meta",
    cell: (board) => roleText(board.writeRoles),
  },
  {
    key: "actions",
    header: "",
    card: "actions",
    className: "text-right",
    // 없앤 게시판은 고칠 것이 없다 — 셀이 null이면 카드 모드에서 자리도 안 생긴다.
    cell: (board) =>
      board.active ? (
        <Link
          href={`/admin/community/${board.id}`}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          설정
        </Link>
      ) : null,
  },
];

export function CommunityList({ boards }: { boards: readonly ManagedBoard[] }) {
  return (
    <DataTable
      minWidth={720}
      rows={boards}
      rowKey={(board) => board.id}
      columns={COLUMNS}
      narrow="cards"
      // 없앤 게시판은 흐리게 — 목록에 남아 있되 살아 있는 것과 섞이지 않는다.
      rowClassName={(board) => (board.active ? "" : "text-mut")}
    />
  );
}
