"use client";

import { useMemo, useState } from "react";
import { ChipDivider } from "@/components/ui/filter-row";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { RevokeButton } from "./revoke-button";
import { honorificName, isRole } from "@/core/authz/roles";
import { maskInviteCode } from "@/lib/invite-code";

export type InviteRow = {
  id: string;
  code: string;
  role: string;
  roleLabel: string;
  status: string;
  /**
   * 아직 가입에 쓸 수 있는가. 서버(`panel.tsx`)가 `isInviteUsable`로 정해 넘긴다 —
   * `expiresAt`은 여기 오면 이미 표시용 문자열이라 만료를 다시 잴 수 없다.
   */
  usable: boolean;
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
  EXPIRED: "neutral",
  USED: "approved",
  REVOKED: "cancelled",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  EXPIRED: "만료",
  USED: "사용됨",
  REVOKED: "폐기",
};

/** 기본은 폐기 제외. 폐기된 코드는 골라야만 보인다. */
const STATUS_FILTERS = [
  { key: "PENDING", label: "대기" },
  { key: "EXPIRED", label: "만료" },
  { key: "USED", label: "사용됨" },
  { key: "REVOKED", label: "폐기" },
  { key: "ALL", label: "모두" },
] as const;

/**
 * 화면이 세고 그리는 상태. DB에는 만료가 없어 기한이 지난 코드도 PENDING으로
 * 남는다 — 그대로 세면 「대기 20」이 쓸 수 없는 코드 20개를 가리키고, 교사는
 * 재발급하지 않는다. 폐기 버튼만은 원래 status를 본다: 만료된 코드도 치울 수 있다.
 */
function displayStatus(row: InviteRow): string {
  return row.status === "PENDING" && !row.usable ? "EXPIRED" : row.status;
}

const ROLE_FILTERS = [
  { key: "ALL", label: "전체" },
  { key: "STUDENT", label: "학생" },
  { key: "ADMIN", label: "교사" },
  { key: "PARENT", label: "학부모" },
] as const;

type StatusKey = (typeof STATUS_FILTERS)[number]["key"];
type RoleKey = (typeof ROLE_FILTERS)[number]["key"];

/**
 * 좁은 폭에서는 카드로 접힌다. 표로 두면 768·1024에서 오른쪽 절반(상태·발급일·
 * 폐기)이 통째로 스크롤 뒤에 숨어, 폐기 버튼에 닿을 방법이 없었다.
 */
const COLUMNS: readonly Column<InviteRow>[] = [
  {
    key: "code",
    header: "코드",
    card: "title",
    cell: (row) => (
      <span
        className="font-mono font-medium text-ink"
        title={row.usable ? undefined : "더는 쓸 수 없는 코드는 일부만 표시합니다."}
      >
        {row.usable ? row.code : maskInviteCode(row.code)}
      </span>
    ),
  },
  {
    key: "role",
    header: "역할",
    card: "meta",
    cell: (row) => <span className="text-mut">{row.roleLabel}</span>,
  },
  {
    key: "name",
    header: "이름",
    card: "title",
    cell: (row) => (
      <span className="text-ink">
        {honorificName(row.name, isRole(row.role) ? row.role : null)}
        {(row.childName || row.birthDate) && (
          <span className="block text-xs text-mut">
            {row.childName
              ? `${honorificName(row.childName, "STUDENT")} 학부모`
              : row.birthDate}
          </span>
        )}
      </span>
    ),
  },
  {
    key: "class",
    header: "학년·반·번호",
    card: "meta",
    cell: (row) =>
      row.classLabel ? (
        <span className="text-ink">{row.classLabel}</span>
      ) : (
        <span className="text-mut">—</span>
      ),
  },
  {
    key: "status",
    header: "상태",
    card: "trailing",
    cell: (row) => (
      <>
        <Badge tone={STATUS_TONE[displayStatus(row)] ?? "neutral"}>
          {STATUS_LABEL[displayStatus(row)] ?? row.status}
        </Badge>
        {row.usedByName && (
          <span className="mt-1 block text-xs text-mut">
            {honorificName(row.usedByName, isRole(row.role) ? row.role : null)}
          </span>
        )}
      </>
    ),
  },
  {
    key: "createdAt",
    header: "발급일",
    card: "meta",
    cell: (row) => (
      <span className="text-mut">
        {row.createdAt}
        {row.expiresAt && <span className="block text-xs">~{row.expiresAt}</span>}
      </span>
    ),
  },
  {
    key: "revoke",
    // 폐기 버튼 열 — 머리글에 이름이 없다.
    header: "",
    card: "actions",
    cell: (row) =>
      row.status === "PENDING" ? (
        <div className="flex justify-end">
          <RevokeButton
            inviteId={row.id}
            ariaLabel={`${honorificName(row.name, isRole(row.role) ? row.role : null)} 초대코드 폐기`}
          />
        </div>
      ) : null,
  },
];

export function InviteTable({ rows }: { rows: InviteRow[] }) {
  const [status, setStatus] = useState<StatusKey>("PENDING");
  const [role, setRole] = useState<RoleKey>("ALL");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      // "모두"에서도 폐기는 따로 골라야 보인다. 만료는 "모두"에 든다.
      if (status === "ALL" ? row.status === "REVOKED" : displayStatus(row) !== status) {
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
      : rows.filter((r) => displayStatus(r) === key).length;

  return (
    <SectionCard
      title="발급 내역"
      aside={<span className="text-xs text-mut">{filtered.length}건</span>}
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
            aria-label="코드 · 이름 · 학반번호 검색"
            placeholder="코드 · 이름 · 학반번호 검색"
            className="mt-2.5"
          />
        </>
      }
      flush
      className="min-w-0"
    >
      {filtered.length === 0 ? (
        <EmptyState variant="inside">조건에 맞는 코드가 없습니다.</EmptyState>
      ) : (
        <DataTable
          minWidth={680}
          narrow="cards"
          rows={filtered}
          rowKey={(row) => row.id}
          columns={COLUMNS}
        />
      )}
    </SectionCard>
  );
}
