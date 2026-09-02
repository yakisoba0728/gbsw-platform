import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterRow } from "@/components/ui/filter-row";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritKind,
  isMeritTrack,
  MERIT_KIND_LABELS,
  MERIT_KINDS,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { ChipLink } from "@/components/ui/chip-link";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchForm } from "@/components/ui/search-form";
import { SectionCard } from "@/components/ui/section-card";
import {
  Skeleton,
  SkeletonRegion,
  SkeletonTable,
} from "@/components/ui/skeleton";
import { TrackTabs } from "@/components/merit/track-tabs";
import { hrefWith } from "@/lib/search-params";
import { filterRules } from "@/components/merit/rule-filter";
import { listRules } from "@/modules/merit/rule.service";
import { RuleForm } from "./rule-form";
import { RuleTable } from "./rule-table";

export const metadata: Metadata = { title: "상벌점 규정" };

const BASE_PATH = "/admin/merit/rules";

type RulesPromise = ReturnType<typeof listRules>;
type RuleRecord = Awaited<RulesPromise>[number];

function visibleRules(
  all: RuleRecord[],
  q: string,
  kind: MeritKind | null,
): RuleRecord[] {
  return filterRules(all, q).filter((rule) => kind === null || rule.kind === kind);
}

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:rule:manage");

  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  const q = typeof raw.q === "string" ? raw.q : "";
  const kind: MeritKind | null = isMeritKind(raw.kind) ? raw.kind : null;
  const filtering = q !== "" || kind !== null;

  const rulesPromise = listRules(actor, track);

  const boundaryKey = JSON.stringify({ track, q, kind });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <RuleForm
        track={track}
        trackTabs={
          <TrackTabs
            current={track}
            hrefFor={(nextTrack) => `${BASE_PATH}?track=${nextTrack}`}
          />
        }
      />

      <SectionCard variant="panel" title="규정 찾기">
        <SearchForm
          action="/admin/merit/rules"
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
        <RulesResult
          promise={rulesPromise}
          q={q}
          kind={kind}
          filtering={filtering}
        />
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
            href={`/admin/merit/rules?track=${track}`}
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

  if (filtering && rules.length === 0) {
    return (
      <SectionCard flush title="규정 목록" aside={<span className="text-xs text-mut">0개</span>}>
        <EmptyState variant="inside">조건에 맞는 규정이 없습니다.</EmptyState>
      </SectionCard>
    );
  }

  return (
    <RuleTable
      expandAllInitially={q.trim() !== ""}
      rules={rules.map((rule) => ({
        ...rule,
        updatedAt: rule.updatedAt.toISOString(),
      }))}
    />
  );
}
