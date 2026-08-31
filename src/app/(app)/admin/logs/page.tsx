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

/**
 * 행위자 한 칸 — 이름 아래에 역할(없으면 이메일)이 선다. 열 폭이 164px로 고정이라
 * 긴 이메일은 언제나 잘린다. 잘린 자리는 마우스·초점이 편다.
 */
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

/**
 * `fixed`가 상세 열을 지킨다 — auto 배치에서는 시각 열이 남는 폭을 먼저 가져가
 * 상세가 164→120px로 줄었다. 대신 시각은 접혀야 한다 (nowrap이면 옆 열을 덮는다).
 */
const COLUMNS: readonly Column<LogEntry>[] = [
  {
    key: "createdAt",
    header: "시각",
    card: "meta",
    cardLabel: false,
    // 초까지 적는다 — 감사로그는 순서를 가려야 하는 자리다.
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
    // IP는 172.18.0.1 꼴이라 108px이면 넉넉하다.
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
    // 로그의 알맹이다 — meta 줄에 끼우면 다른 값들과 한 줄에 섞여 읽히지 않는다.
    // title 자리는 한 줄을 통째로 쓴다.
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
  // 검증은 경계에서 한 번만. 잘못된 쿼리는 기본값으로 떨어진다.
  const parsed = auditQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : auditQuerySchema.parse({});

  // 조회를 시작만 하고 기다리지 않는다. 기다리면 이 함수 전체가 멈춰서 기간 칩·검색칸까지
  // 뼈대로 덮인다 — 방금 고른 조건과 글자를 넣던 칸이 사라지는 그 증상이다.
  // 세 경계가 같은 약속을 나눠 기다리므로 질의는 한 번이다.
  const resultPromise = readAuditLog(actor, query);

  // 조건이 바뀌면 결과 경계를 새로 만든다. 이미 해결된 Suspense 경계는 자식이 다시
  // 매달려도 뼈대 대신 **옛 내용을 그대로** 보여준다 — key가 없으면 필터를 바꿔도 표가
  // 안 바뀐 것처럼 보인다.
  const boundaryKey = JSON.stringify(query);

  return (
    <SectionCard
      title="감사로그"
      aside={
        // 건수는 조회 결과다 — 조건이 바뀌면 표와 함께 뼈대가 된다.
        <Suspense key={`total:${boundaryKey}`} fallback={<Skeleton className="h-4 w-10" />}>
          <LogTotal promise={resultPromise} />
        </Suspense>
      }
      controls={
        // 동작 칩의 목록은 쌓인 로그에서 나오지 지금 고른 조건에서 나오지 않는다.
        // **key를 주지 않는다** — 주면 칩을 누를 때마다 조작부가 통째로 뼈대가 되어
        // 고치려던 증상이 그대로 남는다. key 없는 경계는 다시 매달려도 옛 내용을 그대로
        // 세워 두므로 검색칸의 글자와 포커스가 살아남는다.
        <Suspense fallback={<LogFiltersSkeleton />}>
          <LogFilterBar promise={resultPromise} query={query} />
        </Suspense>
      }
      flush
      className="mx-auto max-w-6xl"
    >
      <Suspense key={`rows:${boundaryKey}`} fallback={<SkeletonRows rows={10} />}>
        <LogRows promise={resultPromise} params={raw} />
      </Suspense>
    </SectionCard>
  );
}

type ResultPromise = ReturnType<typeof readAuditLog>;

/** 건수. 표와 같은 약속을 기다리므로 질의가 늘지 않는다. */
async function LogTotal({ promise }: { promise: ResultPromise }) {
  const { total } = await promise;
  return <span className="text-xs text-mut">{total}건</span>;
}

/**
 * 필터 줄. 기간·행위자는 지금 고른 조건 그대로지만 동작 칩의 목록만은 쌓인 로그에서
 * 나온다 — 표와 같은 약속에 얹어 질의를 늘리지 않는다.
 */
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

/** 필터 자리. loading.tsx와 같은 짜임이라 뼈대에서 화면으로 넘어갈 때 표가 안 튄다. */
function LogFiltersSkeleton() {
  return (
    <>
      <SkeletonTabs count={14} size="sm" width="w-20" className="mt-3 flex-wrap" />
      <SkeletonField size="sm" className="mt-2.5" />
    </>
  );
}

/** 결과 표와 쪽 넘김. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
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

