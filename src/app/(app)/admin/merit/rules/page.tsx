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
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
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

/**
 * 걸러내기는 화면에서 한다 — 수십~수백 줄이라 서버 왕복을 더 할 값이 없고,
 * repo의 정렬(종류 → 분류 → 점수)을 그대로 물려받는다. 건수와 표가 같은 함수를
 * 써야 "3개 중 1개"라고 적어 놓고 두 줄을 보여주는 일이 없다.
 */
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
  // 모르는 값은 교내로 떨어진다 — 화면이 비는 것보다 낫다.
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  const q = typeof raw.q === "string" ? raw.q : "";
  const kind: MeritKind | null = isMeritKind(raw.kind) ? raw.kind : null;
  const filtering = q !== "" || kind !== null;

  // 조회를 시작만 하고 기다리지 않는다. 기다리면 이 함수 전체가 멈춰서 규정 추가 폼과
  // 검색칸·필터까지 뼈대로 덮인다 — 방금 글자를 넣은 칸이 사라지는 그 증상이다.
  // 두 경계가 같은 약속을 나눠 기다리므로 질의는 한 번이다.
  const rulesPromise = listRules(actor, track);

  // 조건이 바뀌면 경계를 새로 만든다. 이미 해결된 Suspense 경계는 자식이 다시 매달려도
  // 뼈대 대신 **옛 내용을 그대로** 보여준다 — key가 없으면 검색해도 표가 안 바뀐 것처럼 보인다.
  const boundaryKey = JSON.stringify({ track, q, kind });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <RuleForm
        track={track}
        trackTabs={
          <TrackTabs
            current={track}
            // 트랙을 바꾸면 검색 조건은 버린다 — 목록 자체가 달라 0건이 빈 화면처럼 읽힌다.
            hrefFor={(nextTrack) => `${BASE_PATH}?track=${nextTrack}`}
          />
        }
      />

      <SectionCard variant="panel" title="규정 찾기">
        {/* 지금 보는 트랙·종류를 함께 실어야 검색과 동시에 필터가 풀리지 않는다. */}
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

        {/* 건수는 조회 결과에서 나온다 — 검색칸·필터를 붙잡아 두려면 여기만 따로 기다린다. */}
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

/** 결과 표. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
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

  // 걸러서 아무것도 안 남았을 때. RuleTable은 "등록된 규정이 없습니다"를 내는데,
  // 규정은 있고 조건에 안 맞을 뿐이라 말이 다르다. 카드 제목은 둘 다 남긴다.
  if (filtering && rules.length === 0) {
    return (
      <SectionCard flush title="규정 목록" aside={<span className="text-xs text-mut">0개</span>}>
        <EmptyState variant="inside">조건에 맞는 규정이 없습니다.</EmptyState>
      </SectionCard>
    );
  }

  return (
    <RuleTable
      rules={rules.map((rule) => ({
        ...rule,
        updatedAt: rule.updatedAt.toISOString(),
      }))}
    />
  );
}
