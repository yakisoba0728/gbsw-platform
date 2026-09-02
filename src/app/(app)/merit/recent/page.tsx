import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { MERIT_KIND_LABELS, MERIT_KINDS } from "@/core/authz/merit-track";
import { honorificName } from "@/core/authz/roles";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { CancelButton } from "@/components/merit/cancel-button";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { cardClass } from "@/components/ui/card";
import { ChipLink } from "@/components/ui/chip-link";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterRow } from "@/components/ui/filter-row";
import { Pagination } from "@/components/ui/pagination";
import { SearchForm } from "@/components/ui/search-form";
import { SectionCard } from "@/components/ui/section-card";
import {
  Skeleton,
  SkeletonRegion,
  SkeletonRows,
} from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/truncated-text";
import { formatDate, formatMonthDayTime, isSameKstDate } from "@/lib/datetime";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import { listRecentAwards } from "@/modules/merit/award.service";
import { formatSeat } from "@/lib/student-number";
import {
  RECENT_AWARD_STATUSES,
  recentAwardsQuerySchema,
  type RecentAwardsQuery,
} from "@/modules/merit/merit.schema";
import { EMPTY_MERIT_STATE } from "../action-state";
import { cancelAction } from "../actions";
import { ExportRecentAwardsButton } from "../export-button";

export const metadata: Metadata = { title: "최근 부여" };

const PATH = "/merit/recent";

const STATUS_LABELS = {
  ACTIVE: "반영",
  CANCELLED: "취소",
} as const;

export default async function RecentAwardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const raw = await searchParams;
  const parsed = recentAwardsQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : recentAwardsQuerySchema.parse({});
  const { track } = query;

  const params: SearchParamsInput = {
    track: query.track,
    kind: query.kind,
    status: query.status,
    q: query.q,
    page: String(query.page),
  };
  const href = (patch: Record<string, string | null>) => hrefWith(PATH, params, patch);

  const resultPromise = listRecentAwards(actor, query);

  const boundaryKey = JSON.stringify(params);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionCard
        variant="panel"
        title="최근 부여"
        aside={
          <TrackTabs
            current={track}
            hrefFor={(nextTrack) => href({ track: nextTrack, page: null })}
          />
        }
      >
        <div className="@container space-y-2.5">
          <RecentAwardControls query={query} href={href} />

          <div className="grid gap-2.5 @2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:items-center">
            <SearchForm
              action={PATH}
              defaultValue={query.q}
              placeholder="학생 · 항목 · 메모 · 부여자"
              ariaLabel="학생, 항목, 메모 또는 부여자 검색"
              maxLength={60}
              hidden={{
                track: query.track,
                kind: query.kind,
                status: query.status,
              }}
              className="flex max-w-xl gap-2"
            />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Suspense key={`total:${boundaryKey}`} fallback={<Skeleton className="h-4 w-10" />}>
                <RecentTotal promise={resultPromise} />
              </Suspense>
              <ExportRecentAwardsButton
                track={query.track}
                kind={query.kind}
                status={query.status}
                q={query.q}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <div className={cardClass("flush")}>
        <Suspense
          key={`rows:${boundaryKey}`}
          fallback={
            <SkeletonRegion>
              <SkeletonRows rows={10} />
            </SkeletonRegion>
          }
        >
          <RecentAwardsRows promise={resultPromise} query={query} />
        </Suspense>

        <Suspense key={`pagination:${boundaryKey}`} fallback={null}>
          <RecentPagination promise={resultPromise} page={query.page} href={href} />
        </Suspense>
      </div>
    </div>
  );
}

type ResultPromise = ReturnType<typeof listRecentAwards>;
type RecentRow = Awaited<ResultPromise>["entries"][number];

async function RecentTotal({ promise }: { promise: ResultPromise }) {
  const { total } = await promise;
  return <span className="text-xs text-mut">총 {total}건</span>;
}

async function RecentPagination({
  promise,
  page,
  href,
}: {
  promise: ResultPromise;
  page: number;
  href: (patch: Record<string, string | null>) => string;
}) {
  const { pageCount } = await promise;

  return (
    <Pagination
      label="최근 부여 페이지"
      page={page}
      pageCount={pageCount}
      href={(next) => href({ page: String(next) })}
    />
  );
}

function cancelNote(row: RecentRow): string | null {
  if (row.status !== "CANCELLED" || !row.cancelReason) return null;

  const by = row.cancelledByName
    ? ` (${honorificName(row.cancelledByName, "ADMIN")})`
    : "";
  return `${row.cancelReason}${by}`;
}

function AwardLabelCell({ row }: { row: RecentRow }) {
  const cancelled = cancelNote(row);

  return (
    <div className="min-w-0">
      <TruncatedText
        full={row.label}
        className={`text-caption ${
          row.status === "CANCELLED" ? "text-mut line-through" : "text-ink"
        }`}
      >
        {row.label}
      </TruncatedText>

      {row.note && (
        <TruncatedText full={`메모 · ${row.note}`} className="mt-0.5 text-xs text-mut2">
          <span className="text-mut">메모</span> · {row.note}
        </TruncatedText>
      )}

      {cancelled && (
        <TruncatedText
          full={`취소 사유 · ${cancelled}`}
          className="mt-0.5 text-xs text-mut2"
        >
          <span className="text-rose">취소 사유</span> · {cancelled}
        </TruncatedText>
      )}
    </div>
  );
}

function StudentLink({ row, track }: { row: RecentRow; track: string }) {
  return (
    <Link
      href={`/students/${row.studentProfileId}?track=${track}`}
      className={`inline-flex min-h-9 items-center font-medium underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0 ${
        row.status === "CANCELLED" ? "text-mut" : "text-ink"
      }`}
    >
      {honorificName(row.studentName, "STUDENT")}
    </Link>
  );
}

function ClassNumber({ row }: { row: RecentRow }) {
  return (
    <span className="text-xs tabular-nums text-mut2">
      {formatSeat(row) ?? "미배정"}
    </span>
  );
}

function AwardPoints({ row }: { row: RecentRow }) {
  return (
    <span
      className={`font-medium whitespace-nowrap ${
        row.status === "CANCELLED" ? "text-mut" : kindColorClass(row.kind)
      }`}
    >
      {signedPoints(row.kind, row.points)}
    </span>
  );
}

function AwardStatus({ row }: { row: RecentRow }) {
  if (row.status === "CANCELLED") return <Badge tone="cancelled">취소</Badge>;

  return (
    <CancelButton
      awardId={row.id}
      studentProfileId={row.studentProfileId}
      cancelAction={cancelAction}
      initialState={EMPTY_MERIT_STATE}
    />
  );
}

async function RecentAwardsRows({
  promise,
  query,
}: {
  promise: ResultPromise;
  query: RecentAwardsQuery;
}) {
  const { entries: rows } = await promise;
  const track = query.track;

  if (rows.length === 0) {
    return (
      <EmptyState variant="inside">
        {query.kind || query.status || query.q
          ? "조건에 맞는 기록이 없습니다."
          : "부여된 상벌점이 없습니다."}
      </EmptyState>
    );
  }

  const columns: Column<RecentRow>[] = [
    {
      key: "createdAt",
      header: "시각",
      width: "w-[136px]",
      cell: (row) => (
        <span className="block text-xs text-mut">
          <span className="whitespace-nowrap">{formatMonthDayTime(row.createdAt)}</span>
          {!isSameKstDate(row.occurredOn, row.createdAt) && (
            <span className="block whitespace-nowrap text-mut2">
              발생 {formatDate(row.occurredOn)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "kind",
      header: "구분",
      width: "w-[68px]",
      cell: (row) => <KindBadge kind={row.kind} />,
    },
    {
      key: "class",
      header: "학급",
      width: "w-[72px]",
      cell: (row) => <ClassNumber row={row} />,
    },
    {
      key: "student",
      header: "학생",
      width: "w-[92px]",
      cell: (row) => <StudentLink row={row} track={track} />,
    },
    {
      key: "label",
      header: "항목 · 사유",
      cell: (row) => <AwardLabelCell row={row} />,
    },
    {
      key: "points",
      header: <span className="block text-right">점수</span>,
      width: "w-[64px]",
      className: "text-right",
      cell: (row) => <AwardPoints row={row} />,
    },
    {
      key: "awardedBy",
      header: "부여자",
      width: "w-[116px]",
      cell: (row) => {
        const name = honorificName(row.awardedByName, "ADMIN");
        return (
          <TruncatedText full={name} className="text-xs text-mut">
            {name}
          </TruncatedText>
        );
      },
    },
    {
      key: "status",
      header: "상태",
      width: "w-[96px]",
      cell: (row) => <AwardStatus row={row} />,
    },
  ];

  return (
    <>
      <ul className="lg:hidden">
        {rows.map((row) => (
          <AwardCard key={row.id} row={row} track={track} />
        ))}
      </ul>

      <div className="hidden lg:block">
        <DataTable
          minWidth={820}
          fixed
          rows={rows}
          rowKey={(row) => row.id}
          columns={columns}
        />
      </div>
    </>
  );
}

function AwardCard({ row, track }: { row: RecentRow; track: string }) {
  const occurred = isSameKstDate(row.occurredOn, row.createdAt)
    ? ""
    : ` (발생 ${formatDate(row.occurredOn)})`;
  const meta = `${formatMonthDayTime(row.createdAt)}${occurred} · ${honorificName(row.awardedByName, "ADMIN")}`;

  return (
    <li className="border-b border-line2 px-5 py-3 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <StudentLink row={row} track={track} />
          <ClassNumber row={row} />
        </span>
        <AwardPoints row={row} />
      </div>

      <div className="mt-1.5 flex items-start gap-2">
        <KindBadge kind={row.kind} />
        <p
          className={`min-w-0 text-caption ${
            row.status === "CANCELLED" ? "text-mut line-through" : "text-ink"
          }`}
        >
          {row.label}
        </p>
      </div>

      <AwardCardDetails row={row} />

      <div className="mt-1.5 flex items-center justify-between gap-3">
        <TruncatedText full={meta} className="text-xs text-mut">
          {meta}
        </TruncatedText>
        <span className="shrink-0">
          <AwardStatus row={row} />
        </span>
      </div>
    </li>
  );
}

function AwardCardDetails({ row }: { row: RecentRow }) {
  const cancelled = cancelNote(row);

  return (
    <>
      {row.note && (
        <p className="mt-1 text-xs text-mut2">
          <span className="text-mut">메모</span> · {row.note}
        </p>
      )}
      {cancelled && (
        <p className="mt-1 text-xs text-mut2">
          <span className="text-rose">취소 사유</span> · {cancelled}
        </p>
      )}
    </>
  );
}

function RecentAwardControls({
  query,
  href,
}: {
  query: RecentAwardsQuery;
  href: (patch: Record<string, string | null>) => string;
}) {
  return (
    <div className="space-y-2.5">
      <FilterRow label="종류">
        <ChipLink href={href({ kind: null, page: null })} active={!query.kind} size="sm">
          전체
        </ChipLink>
        {MERIT_KINDS.map((kind) => (
          <ChipLink
            key={kind}
            href={href({ kind, page: null })}
            active={query.kind === kind}
            size="sm"
          >
            {MERIT_KIND_LABELS[kind]}
          </ChipLink>
        ))}
      </FilterRow>

      <FilterRow label="상태">
        <ChipLink
          href={href({ status: null, page: null })}
          active={!query.status}
          size="sm"
        >
          전체
        </ChipLink>
        {RECENT_AWARD_STATUSES.map((status) => (
          <ChipLink
            key={status}
            href={href({ status, page: null })}
            active={query.status === status}
            size="sm"
          >
            {STATUS_LABELS[status]}
          </ChipLink>
        ))}
      </FilterRow>
    </div>
  );
}
