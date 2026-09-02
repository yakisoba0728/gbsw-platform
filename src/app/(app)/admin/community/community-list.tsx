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
    cell: (board) =>
      board.active ? (
        <Link
          href={`/admin/community/${board.id}`}
          className={buttonClass({ variant: "secondary", size: "sm" })}
          aria-label={`${board.name} 게시판 설정`}
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
      rowClassName={(board) => (board.active ? "" : "text-mut")}
    />
  );
}
