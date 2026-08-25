import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { MERIT_KIND_LABELS, MERIT_KINDS } from "@/core/authz/merit-track";
import { honorificName } from "@/core/authz/roles";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { CancelButton } from "@/components/merit/cancel-button";
import { TrackTabs } from "@/components/merit/track-tabs";
import {
  groupRecentAwards,
  type AwardBatch,
} from "@/components/merit/recent-feed";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";
import { ChipLink } from "@/components/ui/chip-link";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchForm } from "@/components/ui/search-form";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import {
  formatDate,
  formatKstDay,
  formatTimeShort,
  isSameKstDate,
} from "@/lib/datetime";
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

  // 「오늘」·「어제」의 기준. 서버가 한 번 찍어 내려보낸다 — 접는 함수가 시계를
  // 직접 읽으면 테스트가 오늘 날짜에 따라 달라진다.
  const now = new Date();

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

      <div className={cardClass("flush", "overflow-hidden")}>
        <Suspense key={boundaryKey} fallback={<SkeletonRows rows={8} />}>
          <RecentFeed promise={resultPromise} query={query} now={now} />
        </Suspense>
      </div>

      {/* 쪽 넘기기는 다 읽은 뒤에 쓴다 — 위에 두면 목록보다 먼저 눈에 든다. */}
      <Suspense key={boundaryKey} fallback={null}>
        <RecentPagination promise={resultPromise} page={query.page} href={href} />
      </Suspense>
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
  if (pageCount <= 1) return null;

  return (
    <Pagination
      page={page}
      pageCount={pageCount}
      href={(next) => href({ page: String(next) })}
    />
  );
}

/**
 * 결과 목록. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다.
 *
 * 표가 아니라 **날짜 → 부여 한 번 → 받은 학생** 순으로 접는다. 표로 세우면 반
 * 전체에 한 번 준 것이 서로 무관한 스무 줄로 보이고, 시각·항목·부여자가 줄마다
 * 되풀이돼 정작 줄마다 다른 것(누가 받았나)이 묻힌다.
 */
async function RecentFeed({
  promise,
  query,
  now,
}: {
  promise: ResultPromise;
  query: RecentAwardsQuery;
  now: Date;
}) {
  const { entries } = await promise;

  if (entries.length === 0) {
    return (
      <EmptyState variant="inside">
        {query.kind || query.status || query.q
          ? "조건에 맞는 기록이 없습니다."
          : "부여된 상벌점이 없습니다."}
      </EmptyState>
    );
  }

  const days = groupRecentAwards(entries, now);

  return (
    <div>
      {days.map((day) => (
        <section key={day.key}>
          <h2 className="flex items-baseline gap-2 border-b border-line bg-soft px-5 py-2">
            <span className="text-caption font-medium text-ink">{day.label}</span>
            {/* 「오늘」만 적으면 화면을 캡처해 붙여 둔 사람이 언제인지 모른다. */}
            <span className="text-xs text-mut2">{formatKstDay(day.date)}</span>
          </h2>

          {day.batches.map((batch) => (
            <AwardBatchBlock key={batch.key} batch={batch} track={query.track} />
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * 한 번의 부여.
 *
 * 여러 명이면 머리에 모두가 공유하는 사실을, 아래에 줄마다 다른 것(사람과 그
 * 사람의 상태)을 둔다. **한 명이면 그 구조를 쓰지 않는다** — 머리와 한 줄짜리
 * 목록으로 나누면 단건 하나가 표 시절의 두 배 높이를 먹어, 단건이 대부분인
 * 목록에서는 접어 놓고도 더 길어진다.
 */
function AwardBatchBlock({
  batch,
  track,
}: {
  batch: AwardBatch<RecentRow>;
  track: string;
}) {
  // 통째로 취소된 부여는 점수·항목을 물리지 않는다 — 반영된 것과 같은 무게로
  // 서 있으면 목록을 훑을 때 실제 점수를 잘못 읽는다.
  const allCancelled = batch.entries.every((entry) => entry.status === "CANCELLED");
  const single = batch.entries.length === 1 ? batch.entries[0] : null;

  return (
    <article className="border-b border-line last:border-b-0">
      <div className={single ? "px-5 py-3" : "px-5 pt-3.5 pb-3"}>
        <div className="flex items-start justify-between gap-x-4 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="font-mono text-xs text-mut2">
              {formatTimeShort(batch.createdAt)}
            </span>
            <KindBadge kind={batch.kind} />
            <span
              className={`text-caption font-semibold ${
                allCancelled ? "text-mut2" : kindColorClass(batch.kind)
              }`}
            >
              {signedPoints(batch.kind, batch.points)}
            </span>

            {single ? (
              // 한 명이면 받은 사람이 곧 이 부여의 제목이다.
              <StudentName entry={single} track={track} />
            ) : (
              <span className="rounded-full bg-mut-soft px-2 py-0.5 text-xs font-medium text-mut">
                {batch.entries.length}명
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {/* 부여·취소는 교사 전용이라(can.ts) 이름 스냅샷에 역할이 없어도 호칭이 정해진다. */}
            <span className="text-xs text-mut">
              {honorificName(batch.awardedByName, "ADMIN")}
            </span>
            {single && <AwardStatus entry={single} />}
          </div>
        </div>

        <p
          className={`mt-1 text-caption ${
            allCancelled ? "text-mut line-through" : "text-ink"
          }`}
        >
          {batch.label}
        </p>

        {batch.note && (
          <p className="mt-0.5 text-caption text-mut">
            <span className="text-mut2">메모</span> · {batch.note}
          </p>
        )}

        {/* 입력한 날과 실제로 일어난 날이 다를 때만 적는다 — 이 목록은 입력순이다. */}
        {!isSameKstDate(batch.occurredOn, batch.createdAt) && (
          <p className="mt-0.5 text-xs text-mut2">발생 {formatDate(batch.occurredOn)}</p>
        )}

        {single && <CancelNote entry={single} className="mt-1" />}
      </div>

      {!single && (
        <ul className="divide-y divide-line2 border-t border-line2">
          {batch.entries.map((entry) => (
            <AwardStudentRow key={entry.id} entry={entry} track={track} />
          ))}
        </ul>
      )}
    </article>
  );
}

/** 받은 학생 한 줄. 여러 명에게 준 부여에서 줄마다 다른 것은 사람과 상태뿐이다. */
function AwardStudentRow({ entry, track }: { entry: RecentRow; track: string }) {
  return (
    <li className="px-5 py-2">
      <div className="flex items-center gap-3">
        <StudentName entry={entry} track={track} />
        <span className="ml-auto shrink-0">
          <AwardStatus entry={entry} />
        </span>
      </div>

      {/* 학급·번호 너비(68px)와 그 뒤 간격(12px)만큼 들여 이름 아래에 붙는다. */}
      <CancelNote entry={entry} className="mt-0.5 pl-20" />
    </li>
  );
}

/** 학급 · 번호 · 이름. 같은 이름이 두 반에 있을 때 학급·번호가 유일한 구분이다. */
function StudentName({ entry, track }: { entry: RecentRow; track: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {/* 학급과 번호는 한 덩어리다 — 사이가 벌어지면 번호가 이름 쪽으로 뜬다. */}
      <span className="flex shrink-0 items-baseline gap-2 text-xs text-mut2">
        <span className="w-10">
          {entry.grade === null || entry.classNo === null
            ? "미배정"
            : `${entry.grade}-${entry.classNo}`}
        </span>
        <span className="w-5 text-right font-mono">{entry.number ?? "—"}</span>
      </span>

      <Link
        href={`/merit/students/${entry.studentProfileId}?track=${track}`}
        className={`min-w-0 truncate font-medium underline decoration-line-strong underline-offset-2 hover:decoration-ink ${
          entry.status === "CANCELLED" ? "text-mut" : "text-ink"
        }`}
      >
        {entry.studentName}
      </Link>
    </span>
  );
}

/**
 * 취소됐는지, 아니면 취소할 수 있는지.
 * 이 화면의 존재 이유가 "점호 직후 잘못 준 것을 되돌리는 것"이라(nav.ts)
 * 줄마다 취소가 있어야 한다.
 */
function AwardStatus({ entry }: { entry: RecentRow }) {
  if (entry.status === "CANCELLED") return <Badge tone="cancelled">취소</Badge>;

  return (
    <CancelButton
      awardId={entry.id}
      studentProfileId={entry.studentProfileId}
      cancelAction={cancelAction}
      initialState={EMPTY_MERIT_STATE}
    />
  );
}

/**
 * 취소 사유. 필수로 받아 두고 여태 어디에도 보이지 않았다 — 되돌린 일을 나중에
 * 되짚는 자리가 이 화면이다.
 */
function CancelNote({ entry, className }: { entry: RecentRow; className?: string }) {
  if (entry.status !== "CANCELLED" || !entry.cancelReason) return null;

  return (
    <p className={`text-xs text-mut2 ${className ?? ""}`}>
      {entry.cancelReason}
      {entry.cancelledByName && (
        <span className="ml-1.5">— {honorificName(entry.cancelledByName, "ADMIN")}</span>
      )}
    </p>
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
    <nav
      aria-label="최근 부여 페이지"
      className="flex flex-wrap items-center justify-center gap-1.5"
    >
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
