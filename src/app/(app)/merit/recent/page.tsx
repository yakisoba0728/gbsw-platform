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
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/truncated-text";
import { formatDate, formatMonthDayTime, isSameKstDate } from "@/lib/datetime";
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
  // 뼈대 대신 **옛 내용을 그대로** 보여준다 — key가 없으면 검색해도 목록이 안 바뀐 것처럼 보인다.
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
            size="sm"
          />
        }
      >
        {/* 카드 안쪽이라 뷰포트가 아니라 놓인 자리의 폭을 본다. 컨테이너 질의는
            자기 자신을 볼 수 없으므로 기준이 될 상자를 한 겹 둔다. */}
        <div className="@container space-y-2.5">
          {/* 필터와 검색칸은 조회 결과가 아니라 지금 고른 조건이다 — 경계 밖에 둔다. */}
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
              {/* 건수는 결과에서 나온다 — 한 글자짜리 뼈대만 세운다. */}
              <Suspense key={boundaryKey} fallback={<Skeleton className="h-4 w-10" />}>
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
        <Suspense key={boundaryKey} fallback={<SkeletonRows rows={10} />}>
          <RecentAwardsRows promise={resultPromise} query={query} />
        </Suspense>

        {/* 쪽 넘기기는 다 읽은 뒤에 쓴다 — 위에 두면 목록보다 먼저 눈에 든다. */}
        <Suspense key={boundaryKey} fallback={null}>
          <RecentPagination promise={resultPromise} page={query.page} href={href} />
        </Suspense>
      </div>
    </div>
  );
}

type ResultPromise = ReturnType<typeof listRecentAwards>;
type RecentRow = Awaited<ResultPromise>["entries"][number];

/** 총 건수. 목록과 같은 약속을 기다리므로 질의가 늘지 않는다. */
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

/** 취소 사유 + 취소한 사람. 취소된 건이 아니면 없다. */
function cancelNote(row: RecentRow): string | null {
  if (row.status !== "CANCELLED" || !row.cancelReason) return null;

  const by = row.cancelledByName
    ? ` (${honorificName(row.cancelledByName, "ADMIN")})`
    : "";
  return `${row.cancelReason}${by}`;
}

/**
 * 항목 · 메모 · 취소 사유 — **각각 제 줄에 선다.**
 *
 * 한 줄로 이어 붙여 봤고, 그렇게 하면 안 된다. 잘린 자리가 어디까지 항목이고
 * 어디부터 사유인지 알 수 없고, 사유만 보려 해도 항목부터 읽어야 하며, 셋이
 * 이어진 한 줄은 마우스를 올리기 전에는 문장 하나로 읽힌다.
 *
 * 셋 다 500자까지 들어오므로 각각 한 줄로 자르고 각각 마우스로 편다. 줄 높이는
 * 취소 버튼이 이미 정하고 있어서, 줄이 하나 늘어도 표가 두꺼워지지 않는다.
 */
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
          {/* 라벨만 벌점 계열로 — 이 줄이 "무효가 된 건"이라는 표시다. */}
          <span className="text-rose">취소 사유</span> · {cancelled}
        </TruncatedText>
      )}
    </div>
  );
}

/** 학생 이름 — 상세로 가는 링크. 취소된 건은 이름도 물린다. */
function StudentLink({ row, track }: { row: RecentRow; track: string }) {
  return (
    <Link
      href={`/merit/students/${row.studentProfileId}?track=${track}`}
      className={`inline-flex min-h-9 items-center font-medium underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0 ${
        row.status === "CANCELLED" ? "text-mut" : "text-ink"
      }`}
    >
      {row.studentName}
    </Link>
  );
}

/** 학급·번호. 같은 이름이 두 반에 있을 때 유일한 구분이다. */
function ClassNumber({ row }: { row: RecentRow }) {
  return (
    <span className="flex items-baseline gap-1.5 text-xs text-mut2">
      <span>
        {row.grade === null || row.classNo === null
          ? "미배정"
          : `${row.grade}-${row.classNo}`}
      </span>
      <span className="font-mono">{row.number ?? "—"}</span>
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

/**
 * 취소됐는지, 아니면 취소할 수 있는지.
 * 이 화면의 존재 이유가 "점호 직후 잘못 준 것을 되돌리는 것"이라(nav.ts)
 * 줄마다 취소가 있어야 한다.
 */
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

/**
 * 결과 목록. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다.
 *
 * **한 번에 여러 명에게 준 것도 줄을 나눈다.** 부여는 학생 한 명당 한 건이고
 * 취소도 한 건씩이라(`merit.repo`), 묶어 세우면 화면의 단위와 실제로 다루는
 * 단위가 어긋난다.
 *
 * 넓은 폭은 표, 좁은 폭은 카드다. `DataTable`의 카드 모드를 쓰지 않는 이유:
 * 그쪽은 열을 title·meta·trailing 자리에 나눠 넣는데, 이 화면에서 가장 긴 값인
 * **항목이 어느 자리에도 안 맞는다** — meta에 넣으면 시각·학급·부여자와 한 줄로
 * 뒤엉켜 문장이 부스러기처럼 읽힌다.
 */
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
      // 이 목록만 입력순이다 — 앞에 서는 시각도 입력 시각이고, 발생일이 다르면 덧붙인다.
      key: "createdAt",
      header: "시각",
      // 한 줄에 담기는 폭이다. 접히면 표 전체가 두 줄짜리로 두꺼워진다 —
      // table-fixed라 nowrap이 다른 열을 밀지 않는다.
      width: "w-[136px]",
      cell: (row) => (
        // 발생일은 제 줄에 세운다. 한 줄에 이어 붙였더니 table-fixed로 폭이 묶인
        // 칸에서 nowrap이 겹쳐, 「(발생 …)」이 옆 칸의 구분 배지를 덮었다.
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
      // 이 칸은 항목만 담지 않는다 — 메모와 취소 사유가 같은 줄에 이어 선다.
      // 머리글이 「항목」 하나면 뒤에 붙은 글이 무엇인지 표에서 답할 곳이 없다.
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
      cell: (row) => (
        // 부여·취소는 교사 전용이라(can.ts) 이름 스냅샷에 역할이 없어도 호칭이 정해진다.
        <span className="block truncate text-xs text-mut">
          {honorificName(row.awardedByName, "ADMIN")}
        </span>
      ),
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
          // **fixed가 없으면 항목 열이 안 잘린다.** table-layout이 auto면 셀 폭을
          // 내용이 정하므로 `truncate`가 기댈 확정 폭이 없다 — 긴 규정 한 줄이 표를
          // 밀어내고, 밀린 만큼 시각·학생 열이 눌려 이름이 세로로 선다.
          fixed
          rows={rows}
          rowKey={(row) => row.id}
          columns={columns}
        />
      </div>
    </>
  );
}

/**
 * 좁은 폭의 한 건. 표의 여덟 열을 세 줄로 접는다 —
 * 누가·얼마 / 무엇을 / 언제·누가 줬나.
 */
function AwardCard({ row, track }: { row: RecentRow; track: string }) {
  return (
    <li className="border-b border-line2 px-5 py-3 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <StudentLink row={row} track={track} />
          <ClassNumber row={row} />
        </span>
        <AwardPoints row={row} />
      </div>

      {/* 항목은 카드에서 한 줄로 자르지 않는다 — 폰에서는 마우스를 올릴 수 없다. */}
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

      {/* 여백·색을 `DataTable`의 카드 줄(CardRow)과 맞춘다 — 두 카드 무리가
          한 화면에 서므로 바닥 줄만 한 단계 흐리면 다른 것처럼 읽힌다. */}
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-mut">
          {formatMonthDayTime(row.createdAt)}
          {!isSameKstDate(row.occurredOn, row.createdAt) &&
            ` (발생 ${formatDate(row.occurredOn)})`}
          {" · "}
          {honorificName(row.awardedByName, "ADMIN")}
        </span>
        <span className="shrink-0">
          <AwardStatus row={row} />
        </span>
      </div>
    </li>
  );
}

/** 카드의 메모·취소 사유. 표와 달리 자르지 않고 접어서 다 보여준다. */
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

