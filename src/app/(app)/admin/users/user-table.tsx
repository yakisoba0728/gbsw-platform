"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChipDivider } from "@/components/ui/filter-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { honorificName, isRole } from "@/core/authz/roles";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  roleLabel: string;
  active: boolean;
  mustChangePassword: boolean;
  classLabel: string | null;
  createdAt: string;
};

const STATUS_FILTERS = [
  { key: "ACTIVE", label: "활성" },
  { key: "INACTIVE", label: "비활성" },
  { key: "ALL", label: "모두" },
] as const;

const ROLE_FILTERS = [
  { key: "ALL", label: "전체" },
  { key: "ADMIN", label: "교사" },
  { key: "STUDENT", label: "학생" },
  { key: "PARENT", label: "학부모" },
] as const;

type StatusKey = (typeof STATUS_FILTERS)[number]["key"];
type RoleKey = (typeof ROLE_FILTERS)[number]["key"];

const COLUMNS: readonly Column<UserRow>[] = [
  {
    key: "name",
    header: "이름",
    card: "title",
    cell: (row) => (
      <Link
        href={`/admin/users/${row.id}`}
        className="inline-flex min-h-9 flex-col justify-center lg:min-h-0"
      >
        <span className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
          {honorificName(row.name, isRole(row.role) ? row.role : null)}
        </span>
        <span className="block text-xs text-mut">{row.email}</span>
      </Link>
    ),
  },
  {
    key: "role",
    header: "역할",
    card: "meta",
    cell: (row) => <span className="text-mut">{row.roleLabel}</span>,
  },
  {
    key: "class",
    header: "소속",
    card: "meta",
    cell: (row) =>
      row.classLabel ? (
        <span className="text-ink">{row.classLabel}</span>
      ) : (
        <span className="text-mut">—</span>
      ),
  },
  {
    key: "phone",
    header: "연락처",
    card: "meta",
    cell: (row) => <span className="text-mut">{row.phone ?? "—"}</span>,
  },
  {
    key: "status",
    header: "상태",
    card: "trailing",
    cell: (row) => (
      <>
        <Badge tone={row.active ? "approved" : "cancelled"}>
          {row.active ? "활성" : "비활성"}
        </Badge>
        {row.mustChangePassword && (
          <span className="mt-1 block text-xs text-amber-ink">
            비밀번호 변경 대기
          </span>
        )}
      </>
    ),
  },
  {
    key: "createdAt",
    header: "가입일",
    card: "meta",
    cell: (row) => <span className="text-mut">{row.createdAt}</span>,
  },
];

export function UserTable({ rows }: { rows: UserRow[] }) {
  const [status, setStatus] = useState<StatusKey>("ACTIVE");
  const [role, setRole] = useState<RoleKey>("ALL");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (status === "ACTIVE" && !row.active) return false;
      if (status === "INACTIVE" && row.active) return false;
      if (role !== "ALL" && row.role !== role) return false;
      if (!q) return true;

      return [row.name, row.email, row.classLabel, row.phone]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [rows, status, role, query]);

  const countFor = (key: StatusKey) =>
    key === "ALL"
      ? rows.length
      : rows.filter((r) => (key === "ACTIVE" ? r.active : !r.active)).length;

  return (
    <SectionCard
      title="계정"
      aside={<span className="text-xs text-mut">{filtered.length}명</span>}
      controls={
        <>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.key}
                variant="chip"
                size="sm"
                active={status === f.key}
                onClick={() => setStatus(f.key)}
              >
                {f.label} {countFor(f.key)}
              </Button>
            ))}

            <ChipDivider />

            {ROLE_FILTERS.map((f) => (
              <Button
                key={f.key}
                variant="chip"
                size="sm"
                active={role === f.key}
                onClick={() => setRole(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <Input
            size="sm"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            aria-label="이름 · 이메일 · 학반번호 · 전화번호 검색"
            placeholder="이름 · 이메일 · 학반번호 · 전화번호 검색"
            className="mt-2.5"
          />
        </>
      }
      flush
    >
      {filtered.length === 0 ? (
        <EmptyState variant="inside">조건에 맞는 계정이 없습니다.</EmptyState>
      ) : (
        <DataTable
          minWidth={700}
          narrow="cards"
          rows={filtered}
          rowKey={(row) => row.id}
          columns={COLUMNS}
        />
      )}
    </SectionCard>
  );
}
