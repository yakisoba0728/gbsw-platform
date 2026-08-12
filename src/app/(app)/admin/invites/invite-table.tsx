"use client";

import { useMemo, useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RevokeButton } from "./revoke-button";

export type InviteRow = {
  id: string;
  code: string;
  role: string;
  roleLabel: string;
  status: string;
  /** 코드에 등록된 사람 이름 */
  name: string;
  /** "1학년 4반 21번" — 학생 코드이거나 학부모 코드의 자녀 */
  classLabel: string | null;
  /** 학생 코드에만 있음 */
  birthDate: string | null;
  /** 학부모 코드일 때 자녀 이름 */
  childName: string | null;
  createdAt: string;
  expiresAt: string | null;
  usedByName: string | null;
};

const STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "pending",
  USED: "approved",
  REVOKED: "cancelled",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  USED: "사용됨",
  REVOKED: "폐기",
};

/** 기본은 폐기 제외. 폐기된 코드는 골라야만 보인다. */
const STATUS_FILTERS = [
  { key: "PENDING", label: "대기" },
  { key: "USED", label: "사용됨" },
  { key: "REVOKED", label: "폐기" },
  { key: "ALL", label: "모두" },
] as const;

const ROLE_FILTERS = [
  { key: "ALL", label: "전체" },
  { key: "STUDENT", label: "학생" },
  { key: "ADMIN", label: "관리자" },
  { key: "PARENT", label: "학부모" },
] as const;

type StatusKey = (typeof STATUS_FILTERS)[number]["key"];
type RoleKey = (typeof ROLE_FILTERS)[number]["key"];

export function InviteTable({ rows }: { rows: InviteRow[] }) {
  const [status, setStatus] = useState<StatusKey>("PENDING");
  const [role, setRole] = useState<RoleKey>("ALL");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      // "모두"에서도 폐기는 따로 골라야 보인다.
      if (status === "ALL" ? row.status === "REVOKED" : row.status !== status) {
        return false;
      }
      if (role !== "ALL" && row.role !== role) return false;
      if (!q) return true;

      return [row.code, row.name, row.childName, row.classLabel]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [rows, status, role, query]);

  const countFor = (key: StatusKey) =>
    key === "ALL"
      ? rows.filter((r) => r.status !== "REVOKED").length
      : rows.filter((r) => r.status === key).length;

  return (
    <section className="min-w-0 rounded-card border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-ink">발급 내역</h2>
          <span className="text-[12px] text-mut">{filtered.length}건</span>
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
          placeholder="코드 · 이름 · 학반번호 검색"
          className="mt-2.5"
        />
      </header>

      {filtered.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-mut">
          조건에 맞는 코드가 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-line2 text-[12px] text-mut">
                <th className="px-5 py-2.5 font-semibold">코드</th>
                <th className="px-3 py-2.5 font-semibold">역할</th>
                <th className="px-3 py-2.5 font-semibold">이름</th>
                <th className="px-3 py-2.5 font-semibold">학년·반·번호</th>
                <th className="px-3 py-2.5 font-semibold">상태</th>
                <th className="px-3 py-2.5 font-semibold">발급일</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-line2 last:border-0">
                  <td className="px-5 py-3 font-semibold text-ink">{row.code}</td>
                  <td className="px-3 py-3 text-mut">{row.roleLabel}</td>
                  <td className="px-3 py-3 text-ink">
                    {row.name}
                    {(row.childName || row.birthDate) && (
                      <span className="block text-[12px] text-mut">
                        {row.childName ? `${row.childName} 학부모` : row.birthDate}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-ink">
                    {row.classLabel ?? <span className="text-mut">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                    {row.usedByName && (
                      <span className="mt-1 block text-[12px] text-mut">
                        {row.usedByName}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-mut">
                    {row.createdAt}
                    {row.expiresAt && (
                      <span className="block text-[12px]">
                        ~{row.expiresAt}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {row.status === "PENDING" && (
                      <RevokeButton inviteId={row.id} />
                    )}
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
