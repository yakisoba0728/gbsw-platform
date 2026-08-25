import type { ReactNode } from "react";
import Link from "next/link";
import type { MeritTrack } from "@/core/authz/merit-track";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { ChipLink } from "@/components/ui/chip-link";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  STATS_VIEWS,
  STATS_VIEW_LABELS,
  STATS_VIEW_SCOPED,
  statsViewParam,
  type StatsView,
} from "./stats-view";

export type StatsHref = (patch: Record<string, string | null>) => string;

/**
 * 통계 네 갈래가 함께 쓰는 머리글 — 제목 · 집계 범위 · 트랙 탭 · 갈래 탭 · 반 배지.
 *
 * 갈래를 옮겨도 트랙과 학년도는 들고 간다. 개요에서 2학년 3반을 보다가 순위로
 * 넘어가면 같은 반의 순위가 나와야 한다 — 조건이 초기화되면 탭이 아니라 다른
 * 화면으로 읽힌다.
 *
 * **반 조건은 좁힐 수 있는 갈래로 넘어갈 때만 들고 간다.** 교사별·규정별은
 * 학년·반을 보지 않으므로, 그대로 실어 나르면 주소에는 반이 적혀 있는데 화면은
 * 전교를 보여주는 상태가 된다.
 */
export function StatsShell({
  view,
  track,
  href,
  scope,
  hint,
}: {
  view: StatsView;
  track: MeritTrack;
  href: StatsHref;
  /** 지금 좁혀 놓은 반. 좁힐 수 없는 갈래에서는 넘어오지 않는다. */
  scope?: { grade: number; classNo: number };
  /** 집계 범위 한 줄. 갈래마다 제 조회에서 나온다. */
  hint: ReactNode;
}) {
  // SectionCard는 children이 null이면 여백을 만들지 않는다. 조각을 fragment로
  // 감싸 넘기면 늘 "있는 것"이 되어 반을 안 골랐을 때 빈 줄이 남는다.
  const scopeBadge = scope ? (
    // 배지는 지금 고른 조건이다 — 서비스의 scope는 받은 인자를 그대로 돌려주므로
    // 데이터를 기다릴 이유가 없다. 경계 밖에 남긴다.
    //
    // 링크는 배지 밖에 둔다 — 안에 넣고 손가락 크기(min-h-9)를 주면
    // 배지가 40px짜리 알약이 되어 상태 표시가 아니라 버튼으로 읽힌다.
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="info" dot={false}>
        {scope.grade}학년 {scope.classNo}반
      </Badge>
      {/*
        ✕는 "누르면 이 필터가 풀린다"는 장식이다 — 링크 이름에 넣지 않는다.
        gap-1이 낱말 사이 공백을 대신한다 — inline-flex는 글자와 ✕ 사이의
        공백을 지워 "전교 보기✕"로 붙여 놓는다(BackLink와 같은 규격이다).
      */}
      <Link
        href={href({ grade: null, classNo: null })}
        className="inline-flex min-h-9 items-center gap-1 text-sm text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
      >
        전교 보기 <span aria-hidden>✕</span>
      </Link>
    </div>
  ) : null;

  return (
    <SectionCard
      variant="panel"
      title="상벌점 통계"
      hint={hint}
      aside={<TrackTabs current={track} hrefFor={(t) => href({ track: t })} size="sm" />}
      controls={
        <nav aria-label="통계 갈래" className="mt-3 flex flex-wrap gap-1.5">
          {STATS_VIEWS.map((item) => (
            <ChipLink
              key={item}
              size="sm"
              active={item === view}
              href={href({
                view: statsViewParam(item),
                // 반을 못 보는 갈래로 갈 때는 반 조건을 떼고 간다.
                ...(STATS_VIEW_SCOPED[item] ? {} : { grade: null, classNo: null }),
              })}
            >
              {STATS_VIEW_LABELS[item]}
            </ChipLink>
          ))}
        </nav>
      }
    >
      {scopeBadge}
    </SectionCard>
  );
}

/** 집계 범위 한 줄 자리. hint는 `<p>` 안이라 `<span>`으로 그린다. */
export function HintSkeleton() {
  return <Skeleton as="span" className="inline-block h-4 w-64 max-w-full align-middle" />;
}
