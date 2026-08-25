import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  MERIT_KIND_LABELS,
  MERIT_KINDS,
} from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { CancelButton } from "@/components/merit/cancel-button";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ChipLink } from "@/components/ui/chip-link";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchForm } from "@/components/ui/search-form";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/table";
import { formatDate, formatDateTimeShort, isSameKstDate } from "@/lib/datetime";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import { listRecentAwards } from "@/modules/merit/award.service";
import {
  RECENT_AWARD_STATUSES,
  recentAwardsQuerySchema,
  type RecentAwardsQuery,
} from "@/modules/merit/merit.schema";
import { EMPTY_MERIT_STATE } from "../action-state";
import { cancelAction } from "../actions";
import { ExportRecentAwardsButton } from "../export-button";
import { honorificName } from "@/core/authz/roles";

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
  // 검증은 URL 경계에서 한 번만. 잘못된 쿼리는 안전한 기본 필터로 되돌린다.
  const parsed = recentAwardsQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : recentAwardsQuerySchema.parse({});
  const { track } = query;


  // 화면이 이해한 값만 주소에 다시 싣는다. 손으로 넣은 모르는 쿼리를 전파하지 않는다.
  const params: SearchParamsInput = {
    track: query.track,
    kind: query.kind,
    status: query.status,
    q: query.q,
    page: String(query.page),
  };
  const href = (patch: Record<string, string | null>) => hrefWith(PATH, params, patch);


  // 조회를 시작만 하고 기다리지 않는다. 기다리면 이 함수 전체가 멈춰서 검색칸·필터까지
  // 뼈대로 덮인다 — 사용자가 방금 글자를 넣은 칸이 사라지는 그 증상이다.
  // 세 경계가 같은 약속을 나눠 기다리므로 질의는 한 번이다.
  const resultPromise = listRecentAwards(actor, query);

  // 조건이 바뀌면 경계를 새로 만든다. 이미 해결된 Suspense 경계는 자식이 다시 매달려도
  // 뼈대 대신 **옛 내용을 그대로** 보여준다 — key가 없으면 검색해도 표가 안 바뀐 것처럼 보인다.
  const boundaryKey = JSON.stringify(params);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionCard
        title="최근 부여"
        aside={
          <TrackTabs
            current={track}
            hrefFor={(nextTrack) => href({ track: nextTrack, page: null })}
            size="sm"
          />
        }
        controls={
          // 카드 안쪽이라 뷰포트가 아니라 놓인 자리의 폭을 본다. 컨테이너 질의는
          // 자기 자신을 볼 수 없으므로 기준이 될 상자를 한 겹 둔다.
          <div className="@container mt-3">
            {/* 두 칸으로 서려면 검색칸 576px(max-w-xl) + 12px + 건수·내보내기 174px이
                든다 — 그 아래에서는 검색칸이 눌리므로 48rem(@3xl)에서 나눈다. */}
            <div className="grid gap-3 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-end">
              <div className="space-y-2.5">
                {/* 필터와 검색칸은 조회 결과가 아니라 지금 고른 조건이다 — 경계 밖에 둔다. */}
                <RecentAwardControls query={query} href={href} />
                {/* 쪽 수는 결과에서 나온다. 없을 때가 흔해 뼈대 없이 자리만 비운다. */}
                <Suspense key={boundaryKey} fallback={null}>
                  <RecentPagination
                    promise={resultPromise}
                    page={query.page}
                    href={href}
                  />
                </Suspense>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Suspense
                  key={boundaryKey}
                  fallback={<Skeleton className="h-4 w-10" />}
                >
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
        }
        headerAlign="start"
        flush
      >
        <Suspense key={boundaryKey} fallback={<SkeletonRows rows={10} />}>
          <RecentAwardsRows promise={resultPromise} query={query} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

type ResultPromise = ReturnType<typeof listRecentAwards>;

/** 총 건수. 표와 같은 약속을 기다리므로 질의가 늘지 않는다. */
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
  if (pageCount <= 1) return null;

  return (
    <Pagination
      page={page}
      pageCount={pageCount}
      href={(next) => href({ page: String(next) })}
    />
  );
}

/** 결과 표. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
async function RecentAwardsRows({
  promise,
  query,
}: {
  promise: ResultPromise;
  query: RecentAwardsQuery;
}) {
  const { entries: rows } = await promise;
  const track = query.track;


  const columns: Column<(typeof rows)[number]>[] = [
    {
      // 이 목록만 입력순이다 — 앞에 서는 시각도 입력 시각이고, 발생일이 다르면 덧붙인다.
      key: "createdAt",
      header: "시각",
      width: "w-[128px]",
      card: "meta",
      cardLabel: false,
      cell: (row) => (
        // whitespace-nowrap을 쓰지 않는다 — table-layout이 auto라 nowrap인 칸은
        // colgroup의 128px을 무시하고 198px까지 벌어지고, 그만큼 「항목」이 눌려
        // 1024px에서 규정 한 줄이 6줄로 접혔다.
        <span className="font-mono text-xs text-mut">
          {formatDateTimeShort(row.createdAt)}
          {!isSameKstDate(row.occurredOn, row.createdAt) && (
            <span className="block text-mut2">발생 {formatDate(row.occurredOn)}</span>
          )}
        </span>
      ),
    },
    {
      key: "kind",
      header: "구분",
      width: "w-[72px]",
      cell: (row) => <KindBadge kind={row.kind} />,
    },
    {
      key: "student",
      header: "학생",
      width: "w-[96px]",
      card: "title",
      cell: (row) => (
        <Link
          href={`/merit/students/${row.studentProfileId}?track=${track}`}
          className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
        >
          {row.studentName}
        </Link>
      ),
    },
    {
      key: "label",
      header: "항목",
      card: "meta",
      cardLabel: false,
      cell: (row) => (
        <span
          className={`text-caption ${
            row.status === "CANCELLED" ? "text-mut line-through" : "text-ink"
          }`}
        >
          {row.label}
        </span>
      ),
    },
    {
      key: "points",
      header: <span className="block text-right">점수</span>,
      width: "w-[68px]",
      card: "trailing",
      cell: (row) => (
        <span
          className={`block text-right font-medium whitespace-nowrap lg:text-right ${
            row.status === "CANCELLED" ? "text-mut" : kindColorClass(row.kind)
          }`}
        >
          {signedPoints(row.kind, row.points)}
        </span>
      ),
    },
    {
      key: "awardedBy",
      header: "부여자",
      width: "w-[124px]",
      card: "meta",
      // 부여·취소는 교사 전용이라(can.ts) 이름 스냅샷에 역할이 없어도 호칭이 정해진다.
      cell: (row) => (
        <span className="text-xs text-mut">
          {honorificName(row.awardedByName, "ADMIN")}
        </span>
      ),
    },
    {
      key: "status",
      header: "상태",
      width: "w-[108px]",
      card: "actions",
      // 이 화면의 존재 이유가 "점호 직후 잘못 준 것을 되돌리는 것"이라(nav.ts)
      // 줄마다 취소가 있어야 한다. 여러 명에게 준 것도 이제 서로 독립이므로
      // 되돌리는 것도 한 건씩이다.
      cell: (row) =>
        row.status === "CANCELLED" ? (
          <Badge tone="cancelled">취소</Badge>
        ) : (
          <CancelButton
            awardId={row.id}
            studentProfileId={row.studentProfileId}
            cancelAction={cancelAction}
            initialState={EMPTY_MERIT_STATE}
          />
        ),
    },
  ];


  if (rows.length === 0) {
    return (
      <EmptyState variant="inside">
        {query.kind || query.status || query.q
          ? "조건에 맞는 기록이 없습니다."
          : "부여된 상벌점이 없습니다."}
      </EmptyState>
    );
  }

  return (
    <DataTable
      minWidth={700}
      narrow="cards"
      rows={rows}
      rowKey={(row) => row.id}
      columns={columns}
    />
  );
}


/** 지금 고른 조건. 결과가 아니라 입력이라 Suspense 경계 밖에 선다. */
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
        <ChipLink
          href={href({ kind: null, page: null })}
          active={!query.kind}
          size="sm"
        >
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
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-8 text-xs font-medium text-mut">{label}</span>
      {children}
    </div>
  );
}

/** 첫·끝과 현재 주변 두 페이지만 보여 긴 목록에서도 조작부 폭이 고정된다. */
function paginationItems(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set([1, pageCount]);
  for (let value = page - 2; value <= page + 2; value += 1) {
    if (value >= 1 && value <= pageCount) pages.add(value);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  for (const value of sorted) {
    const previous = items.at(-1);
    if (typeof previous === "number" && value - previous > 1) items.push("gap");
    items.push(value);
  }
  return items;
}

function Pagination({
  page,
  pageCount,
  href,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
}) {
  const items = paginationItems(page, pageCount);
  const secondary = buttonClass({ variant: "secondary", size: "sm" });
  const pageClass = (active: boolean) =>
    buttonClass({ variant: "chip", size: "sm", active, className: "min-w-9 px-2" });

  return (
    <nav aria-label="최근 부여 페이지" className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {page <= 1 ? (
        <span aria-disabled="true" className={`${secondary} opacity-40`}>
          이전
        </span>
      ) : (
        <Link href={href(page - 1)} className={secondary}>
          이전
        </Link>
      )}

      {items.map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-mut2" aria-hidden>
            …
          </span>
        ) : item === page ? (
          <span key={item} aria-current="page" className={pageClass(true)}>
            {item}
          </span>
        ) : (
          <Link key={item} href={href(item)} className={pageClass(false)}>
            {item}
          </Link>
        ),
      )}

      {page >= pageCount ? (
        <span aria-disabled="true" className={`${secondary} opacity-40`}>
          다음
        </span>
      ) : (
        <Link href={href(page + 1)} className={secondary}>
          다음
        </Link>
      )}
    </nav>
  );
}
