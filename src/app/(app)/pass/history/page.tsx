import { PASS_HISTORY_COLUMNS } from "@/components/pass/pass-history-columns";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BackLink } from "@/components/ui/back-link";
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

import { requirePermission } from "@/core/auth/session";
import { PASS_STATUS_LABELS, PASS_STATUSES, PASS_TYPE_LABELS, PASS_TYPES } from "@/core/authz/pass-type";
import { honorificName, isRole } from "@/core/authz/roles";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import { formatSeat } from "@/lib/student-number";
import { listPassHistory } from "@/modules/pass/decision.service";

import type { PassHistoryQuery } from "@/modules/pass/pass.schema";
import { ExportPassHistoryButton } from "./export-button";
import { PeriodForm } from "./period-form";
import { parseHistoryPageParams } from "./query";

export const metadata: Metadata = { title: "전체 내역" };

const PATH = "/pass/history";

export default async function PassHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("pass:read:any");

  const raw = await searchParams;
  const { query, periodError, initialFrom, initialTo } =
    parseHistoryPageParams(raw);

  const params: SearchParamsInput = {
    type: query.type,
    status: query.status,
    q: query.q,
    from: query.from,
    to: query.to,
    page: String(query.page),
  };
  const href = (patch: Record<string, string | null>) => hrefWith(PATH, params, patch);

  const resultPromise: ReturnType<typeof listPassHistory> = periodError
    ? Promise.resolve({ entries: [], total: 0, page: query.page, pageCount: 1 })
    : listPassHistory(actor, query);

  const boundaryKey = JSON.stringify(params);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SectionCard
        variant="panel"
        title="전체 내역"
        aside={<BackLink href="/pass">출입증</BackLink>}
      >
        <div className="@container space-y-2.5">
          <HistoryControls
            query={query}
            href={href}
            periodError={periodError}
            initialFrom={initialFrom}
            initialTo={initialTo}
          />

          <div className="grid gap-2.5 @2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:items-center">
            <SearchForm
              action={PATH}
              defaultValue={query.q}
              placeholder="학생 이름 · 학번"
              ariaLabel="학생 이름 또는 학번 검색"
              maxLength={60}
              hidden={{
                type: query.type,
                status: query.status,
                from: query.from,
                to: query.to,
              }}
              className="flex max-w-xl gap-2"
            />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Suspense key={`total:${boundaryKey}`} fallback={<Skeleton className="h-4 w-10" />}>
                <HistoryTotal promise={resultPromise} />
              </Suspense>
              {periodError ? (
                <span className="text-xs text-rose">기간을 바로잡으면 내보낼 수 있습니다.</span>
              ) : (
                <ExportPassHistoryButton
                  type={query.type}
                  status={query.status}
                  q={query.q}
                  from={query.from}
                  to={query.to}
                />
              )}
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
          <HistoryRows
            promise={resultPromise}
            query={query}
            periodError={periodError}
          />
        </Suspense>

        <Suspense key={`pagination:${boundaryKey}`} fallback={null}>
          <HistoryPagination promise={resultPromise} page={query.page} href={href} />
        </Suspense>
      </div>
    </div>
  );
}

type ResultPromise = ReturnType<typeof listPassHistory>;
type HistoryRow = Awaited<ResultPromise>["entries"][number];

async function HistoryTotal({ promise }: { promise: ResultPromise }) {
  const { total } = await promise;
  return <span className="text-xs text-mut">총 {total}건</span>;
}

async function HistoryPagination({
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
      label="출입증 전체 내역 페이지"
      page={page}
      pageCount={pageCount}
      href={(next) => href({ page: String(next) })}
    />
  );
}

function seatOf(row: HistoryRow) {
  const enrollment = row.studentProfile.enrollments[0];
  return {
    grade: enrollment?.grade ?? null,
    classNo: enrollment?.classNo ?? null,
    number: enrollment?.number ?? null,
  };
}

function StudentLink({ row }: { row: HistoryRow }) {
  const user = row.studentProfile.user;

  return (
    <Link
      href={`/pass/${row.id}`}
      className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
    >
      {honorificName(user.name, isRole(user.role) ? user.role : "STUDENT")}
    </Link>
  );
}

const COLUMNS: readonly Column<HistoryRow>[] = [
  PASS_HISTORY_COLUMNS.type,
  PASS_HISTORY_COLUMNS.status,
  {
    key: "seat",
    header: "학급",
    width: "w-[76px]",
    card: "meta",
    cardLabel: false,
    cell: (row) => (
      <span className="text-xs tabular-nums text-mut2">
        {formatSeat(seatOf(row)) ?? "미배정"}
      </span>
    ),
  },
  {
    key: "student",
    header: "학생",
    width: "w-[104px]",
    card: "title",
    cell: (row) => <StudentLink row={row} />,
  },
  PASS_HISTORY_COLUMNS.period,
  PASS_HISTORY_COLUMNS.detail,
  PASS_HISTORY_COLUMNS.decided,
];

async function HistoryRows({
  promise,
  query,
  periodError,
}: {
  promise: ResultPromise;
  query: PassHistoryQuery;
  periodError: string | null;
}) {
  const { entries } = await promise;

  if (periodError) {
    return <EmptyState variant="inside">기간을 바로잡아 다시 조회해 주세요.</EmptyState>;
  }

  if (entries.length === 0) {
    return (
      <EmptyState variant="inside">
        {query.type || query.status || query.q
          ? "조건에 맞는 기록이 없습니다."
          : "이 기간에 나간 기록이 없습니다."}
      </EmptyState>
    );
  }

  return (
    <DataTable
      minWidth={900}
      narrow="cards"
      fixed
      rows={entries}
      rowKey={(row) => row.id}
      columns={COLUMNS}
    />
  );
}

function HistoryControls({
  query,
  href,
  periodError,
  initialFrom,
  initialTo,
}: {
  query: PassHistoryQuery;
  href: (patch: Record<string, string | null>) => string;
  periodError: string | null;
  initialFrom?: string;
  initialTo?: string;
}) {
  return (
    <div className="space-y-2.5">
      <FilterRow label="유형">
        <ChipLink href={href({ type: null, page: null })} active={!query.type} size="sm">
          전체
        </ChipLink>
        {PASS_TYPES.map((type) => (
          <ChipLink
            key={type}
            href={href({ type, page: null })}
            active={query.type === type}
            size="sm"
          >
            {PASS_TYPE_LABELS[type]}
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
        {PASS_STATUSES.map((status) => (
          <ChipLink
            key={status}
            href={href({ status, page: null })}
            active={query.status === status}
            size="sm"
          >
            {PASS_STATUS_LABELS[status]}
          </ChipLink>
        ))}
      </FilterRow>

      <FilterRow label="기간">
        <PeriodForm
          key={`${initialFrom ?? query.from ?? ""}:${initialTo ?? query.to ?? ""}:${periodError ?? ""}`}
          query={query}
          serverError={periodError}
          initialFrom={initialFrom}
          initialTo={initialTo}
        />
      </FilterRow>
    </div>
  );
}
