import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PassDetailCell } from "@/components/pass/pass-detail-cell";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { cardClass } from "@/components/ui/card";
import { ChipLink } from "@/components/ui/chip-link";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterRow } from "@/components/ui/filter-row";
import { Pagination } from "@/components/ui/pagination";
import { SearchForm } from "@/components/ui/search-form";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/truncated-text";
import { requirePermission } from "@/core/auth/session";
import {
  PASS_STATUS_LABELS,
  PASS_STATUSES,
  PASS_TYPE_LABELS,
  PASS_TYPES,
  isPassStatus,
  isPassType,
} from "@/core/authz/pass-type";
import { honorificName, isRole } from "@/core/authz/roles";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import { formatSeat } from "@/lib/student-number";
import { listPassHistory } from "@/modules/pass/decision.service";
import {
  PASS_STATUS_TONES,
  passPeriod,
  passStatusLabel,
} from "@/modules/pass/pass.labels";
import type { PassHistoryQuery } from "@/modules/pass/pass.schema";
import { ExportPassHistoryButton } from "./export-button";
import { PeriodForm } from "./period-form";
import { parseHistoryPageParams } from "./query";

export const metadata: Metadata = { title: "전체 내역" };

const PATH = "/pass/history";

/**
 * 지나간 출입증까지 통째로 훑는 자리. 「결재 대기」와 「지금 나가 있는 학생」은
 * 지금 이 순간만 답하므로 어제 나간 것을 되짚을 곳이 없었다.
 *
 * 짜임은 상벌점의 「최근 부여」(`merit/recent/page.tsx`)와 같다 — 조건은
 * Suspense 경계 밖, 결과만 경계 안이다.
 */
export default async function PassHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("pass:read:any");

  const raw = await searchParams;
  // 필드별로 검증한다. 기간 관계가 틀려도 이미 유효한 유형·상태·검색·쪽은
  // 유지해야 사용자가 날짜 한 칸만 바로잡고 같은 조회를 이어갈 수 있다.
  const { query, periodError, initialFrom, initialTo } =
    parseHistoryPageParams(raw);

  // 화면이 이해한 값만 주소에 다시 싣는다. 손으로 넣은 모르는 쿼리를 전파하지 않는다.
  const params: SearchParamsInput = {
    type: query.type,
    status: query.status,
    q: query.q,
    from: query.from,
    to: query.to,
    page: String(query.page),
  };
  const href = (patch: Record<string, string | null>) => hrefWith(PATH, params, patch);

  // 조회를 시작만 하고 기다리지 않는다. 기다리면 이 함수 전체가 멈춰서 검색칸·기간
  // 칸까지 뼈대로 덮인다 — 사용자가 방금 고른 날짜가 사라지는 그 증상이다.
  // 세 경계가 같은 약속을 나눠 기다리므로 질의는 한 번이다.
  const resultPromise: ReturnType<typeof listPassHistory> = periodError
    ? Promise.resolve({ entries: [], total: 0, page: query.page, pageCount: 1 })
    : listPassHistory(actor, query);

  // 조건이 바뀌면 경계를 새로 만든다. 이미 해결된 Suspense 경계는 자식이 다시
  // 매달려도 뼈대 대신 **옛 내용을 그대로** 보여준다 — key가 없으면 검색해도
  // 목록이 안 바뀐 것처럼 보인다.
  const boundaryKey = JSON.stringify(params);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SectionCard
        variant="panel"
        title="전체 내역"
        aside={<BackLink href="/pass">출입증</BackLink>}
      >
        {/* 카드 안쪽이라 뷰포트가 아니라 놓인 자리의 폭을 본다. 컨테이너 질의는
            자기 자신을 볼 수 없으므로 기준이 될 상자를 한 겹 둔다. */}
        <div className="@container space-y-2.5">
          {/* 조건 칸은 조회 결과가 아니라 지금 고른 것이다 — 경계 밖에 둔다. */}
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
              {/* 건수는 결과에서 나온다 — 한 글자짜리 뼈대만 세운다. */}
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
        <Suspense key={`rows:${boundaryKey}`} fallback={<SkeletonRows rows={10} />}>
          <HistoryRows
            promise={resultPromise}
            query={query}
            periodError={periodError}
          />
        </Suspense>

        {/* 쪽 넘기기는 다 읽은 뒤에 쓴다 — 위에 두면 목록보다 먼저 눈에 든다. */}
        <Suspense key={`pagination:${boundaryKey}`} fallback={null}>
          <HistoryPagination promise={resultPromise} page={query.page} href={href} />
        </Suspense>
      </div>
    </div>
  );
}

type ResultPromise = ReturnType<typeof listPassHistory>;
type HistoryRow = Awaited<ResultPromise>["entries"][number];

/** 총 건수. 목록과 같은 약속을 기다리므로 질의가 늘지 않는다. */
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

/** 그 학년도 재적에서 나온 학번. 같은 이름이 두 반에 있을 때 유일한 구분이다. */
function seatOf(row: HistoryRow) {
  const enrollment = row.studentProfile.enrollments[0];
  return {
    grade: enrollment?.schoolClass?.grade ?? null,
    classNo: enrollment?.schoolClass?.classNo ?? null,
    number: enrollment?.number ?? null,
  };
}

/**
 * 학생 이름 — **그 출입증의 상세로 간다.** 이 화면의 한 줄은 학생이 아니라
 * 출입증 한 건이라, 더 볼 것이 있다면 그 건의 상세다.
 */
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
  {
    key: "type",
    header: "유형",
    width: "w-[64px]",
    card: "meta",
    cardLabel: false,
    cell: (row) => (
      <span className="text-caption text-mut">
        {isPassType(row.type) ? PASS_TYPE_LABELS[row.type] : row.type}
      </span>
    ),
  },
  {
    key: "status",
    header: "상태",
    // 「교사 승인 대기」가 한 줄에 서는 폭이다. 접히면 표 전체가 두꺼워진다.
    width: "w-[112px]",
    card: "trailing",
    cell: (row) =>
      isPassStatus(row.status) ? (
        <Badge tone={PASS_STATUS_TONES[row.status]}>
          {passStatusLabel(row)}
        </Badge>
      ) : (
        <span className="text-caption text-mut">{row.status}</span>
      ),
  },
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
  {
    key: "period",
    header: "기간",
    // 외박이 가장 길다 — 「26. 8. 28. 오후 6:00 ~ 26. 8. 30. 오전 9:00」.
    width: "w-[192px]",
    card: "meta",
    cardLabel: false,
    cell: (row) => (
      <span className="block text-xs tabular-nums text-mut">{passPeriod(row)}</span>
    ),
  },
  {
    key: "detail",
    // 이 칸은 행선지만 담지 않는다 — 사유와 반려·취소 사유가 아래에 이어 선다.
    header: "행선지 · 사유",
    card: "title",
    cell: (row) => <PassDetailCell pass={row} />,
  },
  {
    key: "decided",
    header: "결재자",
    width: "w-[112px]",
    card: "meta",
    cardLabel: "결재",
    cell: (row) => {
      // 결재는 교사 전용이라(can.ts) 이름 스냅샷에 역할이 없어도 호칭이 정해진다.
      const name = row.decidedByName
        ? honorificName(row.decidedByName, "ADMIN")
        : "—";
      return (
        <TruncatedText full={name} className="text-xs text-mut">
          {name}
        </TruncatedText>
      );
    },
  },
];

/** 결과 목록. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
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
      // **fixed가 없으면 행선지 열이 안 잘린다.** table-layout이 auto면 셀 폭을
      // 내용이 정하므로 `truncate`가 기댈 확정 폭이 없다 — 긴 사유 한 줄이 표를
      // 밀어내고, 밀린 만큼 기간·학생 열이 눌려 이름이 세로로 선다.
      fixed
      rows={entries}
      rowKey={(row) => row.id}
      columns={COLUMNS}
    />
  );
}

/** 지금 고른 조건. 결과가 아니라 입력이라 Suspense 경계 밖에 선다. */
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
