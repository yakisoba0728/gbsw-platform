import { PASS_HISTORY_COLUMNS } from "@/components/pass/pass-history-columns";
import Link from "next/link";
import { Suspense } from "react";

import { buttonClass } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";
import { ChipLink } from "@/components/ui/chip-link";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterRow } from "@/components/ui/filter-row";
import { Pagination } from "@/components/ui/pagination";
import {
  SkeletonRegion,
  SkeletonRows,
  SkeletonTabs,
} from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/table";

import type { SessionUser } from "@/core/auth/session";
import { PASS_STATUS_LABELS, PASS_STATUSES, type PassStatus } from "@/core/authz/pass-type";

import type { SearchParamsInput } from "@/lib/search-params";
import {
  countStudentPasses,
  listPassHistory,
} from "@/modules/pass/decision.service";

import { passHistoryQuerySchema } from "@/modules/pass/pass.schema";
import { studentHref } from "./student-tab";

type ResultPromise = ReturnType<typeof listPassHistory>;
type PassRow = Awaited<ResultPromise>["entries"][number];
type CountsPromise = ReturnType<typeof countStudentPasses>;
type Href = (patch: Record<string, string | null>) => string;

export function PassTab({
  actor,
  studentId,
  params,
}: {
  actor: SessionUser;
  studentId: string;
  params: SearchParamsInput;
}) {
  const parsed = passHistoryQuerySchema.safeParse({
    status: params.status,
    page: params.page,
    studentProfileId: studentId,
  });
  const query = parsed.success
    ? parsed.data
    : passHistoryQuerySchema.parse({ studentProfileId: studentId });

  const href: Href = (patch) => studentHref(studentId, params, { tab: "pass", ...patch });

  const resultPromise = listPassHistory(actor, query);
  const countsPromise = countStudentPasses(actor, studentId);

  const boundaryKey = JSON.stringify({
    status: query.status ?? null,
    page: query.page,
  });

  return (
    <div className="space-y-4">
      <Suspense
        key={`filter:${boundaryKey}`}
        fallback={<SkeletonTabs count={6} size="sm" className="flex-wrap" />}
      >
        <StatusFilter promise={countsPromise} current={query.status} href={href} />
      </Suspense>

      <div className={cardClass("flush")}>
        <Suspense
          key={`rows:${boundaryKey}`}
          fallback={
            <SkeletonRegion>
              <SkeletonRows rows={8} />
            </SkeletonRegion>
          }
        >
          <PassRows promise={resultPromise} status={query.status} />
        </Suspense>

        <Suspense key={`pagination:${boundaryKey}`} fallback={null}>
          <PassPagination promise={resultPromise} page={query.page} href={href} />
        </Suspense>
      </div>
    </div>
  );
}

async function StatusFilter({
  promise,
  current,
  href,
}: {
  promise: CountsPromise;
  current: PassStatus | undefined;
  href: Href;
}) {
  const { byStatus, total } = await promise;

  return (
    <FilterRow label="상태">
      <ChipLink href={href({ status: null, page: null })} active={!current} size="sm">
        전체 {total}
      </ChipLink>
      {PASS_STATUSES.map((status) => (
        <ChipLink
          key={status}
          href={href({ status, page: null })}
          active={current === status}
          size="sm"
        >
          {PASS_STATUS_LABELS[status]} {byStatus[status]}
        </ChipLink>
      ))}
    </FilterRow>
  );
}

async function PassPagination({
  promise,
  page,
  href,
}: {
  promise: ResultPromise;
  page: number;
  href: Href;
}) {
  const { pageCount } = await promise;

  return (
    <Pagination
      label="학생 출입증 내역 페이지"
      page={page}
      pageCount={pageCount}
      href={(next) => href({ page: String(next) })}
    />
  );
}

const COLUMNS: readonly Column<PassRow>[] = [
  PASS_HISTORY_COLUMNS.type,
  PASS_HISTORY_COLUMNS.status,
  PASS_HISTORY_COLUMNS.period,
  PASS_HISTORY_COLUMNS.detail,
  PASS_HISTORY_COLUMNS.decided,
  {
    key: "open",
    header: "상세",
    width: "w-[72px]",
    card: "actions",
    cell: (row) => (
      <Link
        href={`/pass/${row.id}`}
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        보기
      </Link>
    ),
  },
];

async function PassRows({
  promise,
  status,
}: {
  promise: ResultPromise;
  status: PassStatus | undefined;
}) {
  const { entries } = await promise;

  if (entries.length === 0) {
    return (
      <EmptyState variant="inside">
        {status
          ? `${PASS_STATUS_LABELS[status]} 기록이 없습니다.`
          : "출입증 기록이 없습니다."}
      </EmptyState>
    );
  }

  return (
    <DataTable
      minWidth={780}
      narrow="cards"
      fixed
      rows={entries}
      rowKey={(row) => row.id}
      columns={COLUMNS}
    />
  );
}
