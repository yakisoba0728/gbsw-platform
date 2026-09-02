import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/core/auth/session";
import { formatDateTime } from "@/lib/datetime";
import { honorificName, isRole, ROLE_LABELS } from "@/core/authz/roles";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  Skeleton,
  SkeletonField,
  SkeletonRegion,
  SkeletonRows,
  SkeletonTabs,
} from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { DataTable, type Column } from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/truncated-text";
import { hrefWith } from "@/lib/search-params";
import {
  auditActionLabel,
  auditActionTone,
  auditTargetLabel,
  formatAuditMetadata,
} from "@/modules/audit-log/audit-log.labels";
import {
  auditQuerySchema,
  type AuditQuery,
} from "@/modules/audit-log/audit-log.schema";
import { readAuditLog } from "@/modules/audit-log/audit-log.service";
import { LogFilters } from "./log-filters";

export const metadata: Metadata = { title: "감사로그" };

type LogEntry = Awaited<ReturnType<typeof readAuditLog>>["entries"][number];

function ActorCell({ entry }: { entry: LogEntry }) {
  const role = isRole(entry.actor?.role) ? entry.actor.role : null;
  const name = honorificName(entry.actorName, role);
  const under = entry.actor
    ? role
      ? ROLE_LABELS[role]
      : entry.actor.email
    : "삭제된 계정";

  return (
    <>
      <TruncatedText full={name} className="text-ink">
        {name}
      </TruncatedText>
      <TruncatedText full={under} className="text-xs text-mut">
        {under}
      </TruncatedText>
    </>
  );
}

const COLUMNS: readonly Column<LogEntry>[] = [
  {
    key: "createdAt",
    header: "시각",
    card: "meta",
    cardLabel: false,
    width: "w-[152px]",
    cell: (entry) => (
      <span className="tabular-nums text-mut">{formatDateTime(entry.createdAt)}</span>
    ),
  },
  {
    key: "actor",
    header: "행위자",
    card: "title",
    width: "w-[164px]",
    cell: (entry) => <ActorCell entry={entry} />,
  },
  {
    key: "action",
    header: "동작",
    card: "trailing",
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
    card: "meta",
    width: "w-[76px]",
    cell: (entry) => (
      <span className="text-mut">{auditTargetLabel(entry.targetType)}</span>
    ),
  },
  {
    key: "ip",
    header: "접속",
    card: "meta",
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
    card: "title",
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
  const parsed = auditQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : auditQuerySchema.parse({});

  const resultPromise = readAuditLog(actor, query);

  const boundaryKey = JSON.stringify(query);

  return (
    <SectionCard
      title="감사로그"
      aside={
        <Suspense key={`total:${boundaryKey}`} fallback={<Skeleton className="h-4 w-10" />}>
          <LogTotal promise={resultPromise} />
        </Suspense>
      }
      controls={
        <Suspense fallback={<LogFiltersSkeleton />}>
          <LogFilterBar promise={resultPromise} query={query} />
        </Suspense>
      }
      flush
      className="mx-auto max-w-6xl"
    >
      <Suspense
        key={`rows:${boundaryKey}`}
        fallback={
          <SkeletonRegion>
            <SkeletonRows rows={10} />
          </SkeletonRegion>
        }
      >
        <LogRows promise={resultPromise} params={raw} />
      </Suspense>
    </SectionCard>
  );
}

type ResultPromise = ReturnType<typeof readAuditLog>;

async function LogTotal({ promise }: { promise: ResultPromise }) {
  const { total } = await promise;
  return <span className="text-xs text-mut">{total}건</span>;
}

async function LogFilterBar({
  promise,
  query,
}: {
  promise: ResultPromise;
  query: AuditQuery;
}) {
  const { actions } = await promise;

  return (
    <LogFilters
      actions={actions}
      period={query.period}
      action={query.action ?? ""}
      actor={query.actor ?? ""}
    />
  );
}

function LogFiltersSkeleton() {
  return (
    <>
      <SkeletonTabs count={14} size="sm" width="w-20" className="mt-3 flex-wrap" />
      <SkeletonField size="sm" className="mt-2.5" />
    </>
  );
}

async function LogRows({
  promise,
  params,
}: {
  promise: ResultPromise;
  params: Record<string, string | string[] | undefined>;
}) {
  const { entries, page, pageCount } = await promise;

  return (
    <>
      {entries.length === 0 ? (
        <EmptyState variant="inside">조건에 맞는 기록이 없습니다.</EmptyState>
      ) : (
        <DataTable
          minWidth={700}
          narrow="cards"
          fixed
          rows={entries}
          rowKey={(entry) => entry.id}
          columns={COLUMNS}
        />
      )}

      <Pagination
        label="감사로그 페이지"
        page={page}
        pageCount={pageCount}
        href={(next) => hrefWith("/admin/logs", params, { page: String(next) })}
      />
    </>
  );
}
