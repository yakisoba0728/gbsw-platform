import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { KindBadge, kindColorClass } from "@/components/merit/kind-badge";
import { filterRules } from "@/components/merit/rule-filter";
import { TrackTabs } from "@/components/merit/track-tabs";
import { ChipLink } from "@/components/ui/chip-link";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterRow } from "@/components/ui/filter-row";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { SearchForm } from "@/components/ui/search-form";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
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

/** 건수와 표가 같은 함수를 써야 「3개 중 1개」라고 적어 놓고 두 줄을 보여주지 않는다. */
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

/**
 * 학생·학부모가 읽는 규정표. 교사의 규정 관리(`/admin/merit/rules`)와 자료는 같고
 * **고치는 길이 없다** — 권한도 함수도 따로다(`merit:rule:read`).
 *
 * 「무엇을 하면 몇 점인지」를 찾으러 오는 화면이라 검색과 종류 거르기를 함께 둔다.
 * 교내·기숙사는 메뉴로 가르지 않고 화면 안의 탭이 고른다 — 다른 상벌점 화면과 같다.
 */
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

  // 기다리지 않고 약속만 넘긴다 — 기다리면 검색칸과 탭까지 함께 뼈대로 덮여,
  // 방금 글자를 넣은 칸이 사라진다. 두 경계가 같은 약속을 나눠 질의는 한 번이다.
  const rulesPromise = listRulesForReading(actor, track);
  const boundaryKey = JSON.stringify({ track, q, kind });

  return (
    <PageScaffold
      width="data"
      title="상벌점 규정"
      description="학교가 정한 상벌점 항목과 점수를 찾습니다."
      tabs={
        <TrackTabs
          current={track}
          // 트랙을 바꾸면 검색 조건은 버린다 — 목록이 달라 0건이 빈 화면처럼 읽힌다.
          hrefFor={(nextTrack) => `${BASE_PATH}?track=${nextTrack}`}
        />
      }
    >
      <SectionCard variant="panel" title="규정 찾기">
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

      <Suspense key={`rows:${boundaryKey}`} fallback={<SkeletonTable rows={10} />}>
        <RulesResult promise={rulesPromise} q={q} kind={kind} filtering={filtering} />
      </Suspense>
    </PageScaffold>
  );
}

/** 총 건수. 표와 같은 약속을 기다리므로 질의가 늘지 않는다. */
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
        // 「규정이 없다」와 「조건에 안 맞는다」는 다른 말이다.
        <EmptyState variant="inside">
          {filtering ? "조건에 맞는 규정이 없습니다." : "등록된 규정이 없습니다."}
        </EmptyState>
      ) : (
        <DataTable
          ariaLabel="상벌점 규정 목록"
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
