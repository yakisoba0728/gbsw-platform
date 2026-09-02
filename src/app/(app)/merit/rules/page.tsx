import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { KindBadge, kindColorClass } from "@/components/merit/kind-badge";
import { filterRules } from "@/components/merit/rule-filter";
import { TrackTabs } from "@/components/merit/track-tabs";
import { ChipLink } from "@/components/ui/chip-link";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterRow } from "@/components/ui/filter-row";
import { SearchForm } from "@/components/ui/search-form";
import { SectionCard } from "@/components/ui/section-card";
import {
  Skeleton,
  SkeletonRegion,
  SkeletonTable,
} from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/table";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritKind,
  isMeritTrack,
  MERIT_KIND_LABELS,
  MERIT_KINDS,
  meritKindSign,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { hrefWith } from "@/lib/search-params";
import { listRulesForReading } from "@/modules/merit/rule.service";

export const metadata: Metadata = { title: "상벌점 규정" };

const BASE_PATH = "/merit/rules";

type RulesPromise = ReturnType<typeof listRulesForReading>;
type RuleRecord = Awaited<RulesPromise>[number];

function visibleRules(
  all: RuleRecord[],
  q: string,
  kind: MeritKind | null,
): RuleRecord[] {
  return filterRules(all, q).filter((rule) => kind === null || rule.kind === kind);
}

const COLUMNS: readonly Column<RuleRecord>[] = [
  {
    key: "kind",
    header: "종류",
    width: "w-[76px]",
    card: "meta",
    cardLabel: false,
    cell: (rule) => <KindBadge kind={rule.kind} />,
  },
  {
    key: "category",
    header: "분류",
    width: "w-[136px]",
    card: "meta",
    cardLabel: false,
    cell: (rule) =>
      rule.category ? (
        <span className="text-mut">{rule.category}</span>
      ) : (
        <span className="text-mut2">—</span>
      ),
  },
  {
    key: "label",
    header: "항목",
    card: "title",
    cell: (rule) => (
      <span className="font-medium text-ink">
        {rule.label}
        {rule.description && (
          <span className="mt-0.5 block text-xs font-normal text-mut">
            {rule.description}
          </span>
        )}
      </span>
    ),
  },
  {
    key: "points",
    header: "점수",
    width: "w-[72px]",
    className: "text-right tabular-nums",
    card: "trailing",
    cell: (rule) => (
      <span className={`font-medium ${kindColorClass(rule.kind)}`}>
        {meritKindSign(rule.kind)}
        {rule.points}
      </span>
    ),
  },
];

export default async function MeritRulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:rule:read");

  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  const q = typeof raw.q === "string" ? raw.q : "";
  const kind: MeritKind | null = isMeritKind(raw.kind) ? raw.kind : null;
  const filtering = q !== "" || kind !== null;

  const rulesPromise = listRulesForReading(actor, track);
  const boundaryKey = JSON.stringify({ track, q, kind });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionCard
        variant="panel"
        title="상벌점 규정"
        hint="학교가 정한 항목과 점수입니다."
        aside={
          <TrackTabs
            current={track}
            hrefFor={(nextTrack) => `${BASE_PATH}?track=${nextTrack}`}
          />
        }
      >
        <SearchForm
          action={BASE_PATH}
          defaultValue={q}
          placeholder="항목명 또는 분류로 검색"
          ariaLabel="규정 항목명 또는 분류 검색"
          hidden={{ track, kind }}
        />

        <FilterRow label="종류" className="mt-3">
          <ChipLink
            href={hrefWith(BASE_PATH, raw, { kind: null })}
            active={kind === null}
            size="sm"
          >
            전체
          </ChipLink>
          {MERIT_KINDS.map((k) => (
            <ChipLink
              key={k}
              href={hrefWith(BASE_PATH, raw, { kind: k })}
              active={kind === k}
              size="sm"
            >
              {MERIT_KIND_LABELS[k]}
            </ChipLink>
          ))}
        </FilterRow>

        <Suspense
          key={`count:${boundaryKey}`}
          fallback={<Skeleton className="mt-3 h-4 w-16 rounded-btn" />}
        >
          <RuleCount
            promise={rulesPromise}
            q={q}
            kind={kind}
            track={track}
            filtering={filtering}
          />
        </Suspense>
      </SectionCard>

      <Suspense
        key={`rows:${boundaryKey}`}
        fallback={
          <SkeletonRegion>
            <SkeletonTable rows={10} />
          </SkeletonRegion>
        }
      >
        <RulesResult promise={rulesPromise} q={q} kind={kind} filtering={filtering} />
      </Suspense>
    </div>
  );
}

async function RuleCount({
  promise,
  q,
  kind,
  track,
  filtering,
}: {
  promise: RulesPromise;
  q: string;
  kind: MeritKind | null;
  track: MeritTrack;
  filtering: boolean;
}) {
  const all = await promise;
  const rules = visibleRules(all, q, kind);

  return (
    <p className="mt-3 text-xs text-mut">
      {filtering ? `${all.length}개 중 ${rules.length}개` : `${all.length}개`}
      {filtering && (
        <>
          {" · "}
          <Link
            href={`${BASE_PATH}?track=${track}`}
            className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            조건 지우기
          </Link>
        </>
      )}
    </p>
  );
}

async function RulesResult({
  promise,
  q,
  kind,
  filtering,
}: {
  promise: RulesPromise;
  q: string;
  kind: MeritKind | null;
  filtering: boolean;
}) {
  const all = await promise;
  const rules = visibleRules(all, q, kind);

  return (
    <SectionCard
      flush
      title="규정 목록"
      aside={<span className="text-xs text-mut">{rules.length}개</span>}
    >
      {rules.length === 0 ? (
        <EmptyState variant="inside">
          {filtering ? "조건에 맞는 규정이 없습니다." : "등록된 규정이 없습니다."}
        </EmptyState>
      ) : (
        <DataTable
          minWidth={560}
          narrow="cards"
          rows={rules}
          rowKey={(rule) => rule.id}
          columns={COLUMNS}
        />
      )}
    </SectionCard>
  );
}
