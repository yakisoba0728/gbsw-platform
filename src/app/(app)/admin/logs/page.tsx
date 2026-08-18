import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { formatDateTime } from "@/lib/datetime";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { hrefWith } from "@/lib/search-params";
import {
  auditActionLabel,
  auditActionTone,
  auditTargetLabel,
  formatAuditMetadata,
} from "@/modules/audit-log/audit-log.labels";
import { auditQuerySchema } from "@/modules/audit-log/audit-log.schema";
import { readAuditLog } from "@/modules/audit-log/audit-log.service";
import { LogFilters } from "./log-filters";

export const metadata: Metadata = { title: "감사로그" };

type LogEntry = Awaited<ReturnType<typeof readAuditLog>>["entries"][number];

/**
 * `fixed`가 상세 열을 지킨다 — auto 배치에서는 시각 열이 남는 폭을 먼저 가져가
 * 상세가 164→120px로 줄었다. 대신 시각은 접혀야 한다 (nowrap이면 옆 열을 덮는다).
 */
const COLUMNS: readonly Column<LogEntry>[] = [
  {
    key: "createdAt",
    header: "시각",
    // 초까지 적는다 — 감사로그는 순서를 가려야 하는 자리다.
    width: "w-[152px]",
    cell: (entry) => (
      <span className="font-mono text-mut">{formatDateTime(entry.createdAt)}</span>
    ),
  },
  {
    key: "actor",
    header: "행위자",
    width: "w-[132px]",
    cell: (entry) => (
      <>
        <span className="block truncate text-ink">{entry.actorName}</span>
        <span className="block truncate text-xs text-mut">
          {entry.actor
            ? isRole(entry.actor.role)
              ? ROLE_LABELS[entry.actor.role]
              : entry.actor.email
            : "삭제된 계정"}
        </span>
      </>
    ),
  },
  {
    key: "action",
    header: "동작",
    width: "w-[116px]",
    cell: (entry) => (
      <Badge tone={auditActionTone(entry.action)}>
        {auditActionLabel(entry.action)}
      </Badge>
    ),
  },
  {
    key: "target",
    header: "대상",
    width: "w-[76px]",
    cell: (entry) => (
      <span className="text-mut">{auditTargetLabel(entry.targetType)}</span>
    ),
  },
  {
    key: "ip",
    // IP는 172.18.0.1 꼴이라 108px이면 넉넉하다.
    header: "접속",
    width: "w-[108px]",
    cell: (entry) => (
      <span className="font-mono text-mut" title={entry.userAgent ?? undefined}>
        {entry.ip ?? "—"}
      </span>
    ),
  },
  {
    key: "metadata",
    header: "상세",
    cell: (entry) => (
      <span className="block text-xs break-words text-mut">
        {formatAuditMetadata(entry.action, entry.metadata) ?? "—"}
      </span>
    ),
  },
];

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("audit:read");

  const raw = await searchParams;
  // 검증은 경계에서 한 번만. 잘못된 쿼리는 기본값으로 떨어진다.
  const parsed = auditQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : auditQuerySchema.parse({});

  const { entries, total, actions, page, pageCount } = await readAuditLog(
    actor,
    query,
  );

  return (
    <SectionCard
      title="감사로그"
      aside={<span className="text-xs text-mut">{total}건</span>}
      controls={
        <LogFilters
          actions={actions}
          period={query.period}
          action={query.action ?? ""}
          actor={query.actor ?? ""}
        />
      }
      flush
      className="mx-auto max-w-6xl"
    >
      {entries.length === 0 ? (
        <EmptyState variant="inside">조건에 맞는 기록이 없습니다.</EmptyState>
      ) : (
        <DataTable
          minWidth={700}
          fixed
          rows={entries}
          rowKey={(entry) => entry.id}
          columns={COLUMNS}
        />
      )}

      {pageCount > 1 && (
        // px-3 + 링크의 px-2 = 표의 px-5. 링크가 자기 터치 영역을 갖는다.
        <nav className="flex items-center justify-between border-t border-line px-3 py-1.5 text-caption">
          <PageLink page={page - 1} disabled={page <= 1} params={raw}>
            이전
          </PageLink>
          <span className="text-mut">
            {page} / {pageCount}
          </span>
          <PageLink page={page + 1} disabled={page >= pageCount} params={raw}>
            다음
          </PageLink>
        </nav>
      )}
    </SectionCard>
  );
}

function PageLink({
  page,
  disabled,
  params,
  children,
}: {
  page: number;
  disabled: boolean;
  params: Record<string, string | string[] | undefined>;
  children: React.ReactNode;
}) {
  // 손가락으로 누르는 자리라 글자만큼이 아니라 36px을 차지한다.
  const box = "inline-flex min-h-9 items-center px-2";

  if (disabled) {
    return <span className={`${box} text-mut2`}>{children}</span>;
  }

  return (
    <Link
      href={hrefWith("/admin/logs", params, { page: String(page) })}
      className={`${box} font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink`}
    >
      {children}
    </Link>
  );
}
