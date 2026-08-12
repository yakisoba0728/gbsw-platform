"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SettingsIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  /** 지금 로그인한 관리자 본인인가 */
  isSelf: boolean;
};

const STATUS_FILTERS = [
  { key: "ACTIVE", label: "활성" },
  { key: "INACTIVE", label: "비활성" },
  { key: "ALL", label: "모두" },
] as const;

const ROLE_FILTERS = [
  { key: "ALL", label: "전체" },
  { key: "ADMIN", label: "관리자" },
  { key: "STUDENT", label: "학생" },
  { key: "PARENT", label: "학부모" },
] as const;

type StatusKey = (typeof STATUS_FILTERS)[number]["key"];
type RoleKey = (typeof ROLE_FILTERS)[number]["key"];

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
    <section className="rounded-card border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-ink">사용자</h2>
          <span className="text-[12px] text-mut">{filtered.length}명</span>
        </div>

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

          <span className="mx-1 h-4 w-px bg-line" aria-hidden />

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
          dense
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="이름 · 이메일 · 학반번호 · 전화번호 검색"
          className="mt-2.5"
        />
      </header>

      {filtered.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-mut">
          조건에 맞는 사용자가 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-line2 text-[12px] text-mut">
                <th className="px-5 py-2.5 font-semibold">이름</th>
                <th className="px-3 py-2.5 font-semibold">역할</th>
                <th className="px-3 py-2.5 font-semibold">소속</th>
                <th className="px-3 py-2.5 font-semibold">연락처</th>
                <th className="px-3 py-2.5 font-semibold">상태</th>
                <th className="px-3 py-2.5 font-semibold">가입일</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-line2 last:border-0">
                  <td className="px-5 py-3">
                    <span className="font-semibold text-ink">{row.name}</span>
                    <span className="block text-[12px] text-mut">{row.email}</span>
                  </td>
                  <td className="px-3 py-3 text-mut">{row.roleLabel}</td>
                  <td className="px-3 py-3 text-ink">
                    {row.classLabel ?? <span className="text-mut">—</span>}
                  </td>
                  <td className="px-3 py-3 text-mut">{row.phone ?? "—"}</td>
                  <td className="px-3 py-3">
                    <Badge tone={row.active ? "approved" : "cancelled"}>
                      {row.active ? "활성" : "비활성"}
                    </Badge>
                    {row.mustChangePassword && (
                      <span className="mt-1 block text-[12px] text-amber-ink">
                        비밀번호 변경 대기
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-mut">{row.createdAt}</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/users/${row.id}`}
                      aria-label={`${row.name} 상세`}
                      title="상세 · 수정"
                      className="inline-flex size-8 items-center justify-center rounded-btn border border-line text-mut transition-colors hover:bg-soft hover:text-ink"
                    >
                      <SettingsIcon size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

