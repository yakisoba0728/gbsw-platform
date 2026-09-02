import type { ReactNode } from "react";
import Link from "next/link";
import type { MeritTrack } from "@/core/authz/merit-track";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, SegmentLink } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import {
  STATS_VIEWS,
  STATS_VIEW_LABELS,
  STATS_VIEW_SCOPED,
  statsViewParam,
  type StatsView,
} from "./stats-view";

export type StatsHref = (patch: Record<string, string | null>) => string;

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
  scope?: { grade: number; classNo: number };
  hint: ReactNode;
}) {
  const scopeBadge = scope ? (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="info" dot={false}>
        {scope.grade}학년 {scope.classNo}반
      </Badge>
      <Link
        href={href({ grade: null, classNo: null })}
        className="inline-flex min-h-9 items-center gap-1 text-sm text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
      >
        전교 보기 <span aria-hidden>✕</span>
      </Link>
    </div>
  ) : null;

  return (
    <PageHeader
      title="상벌점 통계"
      description={hint}
      actions={<TrackTabs current={track} hrefFor={(t) => href({ track: t })} />}
      tabs={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Segmented role="navigation" aria-label="통계 갈래">
            {STATS_VIEWS.map((item) => (
              <SegmentLink
                key={item}
                active={item === view}
                href={href({
                  view: statsViewParam(item),
                  ...(STATS_VIEW_SCOPED[item] ? {} : { grade: null, classNo: null }),
                })}
              >
                {STATS_VIEW_LABELS[item]}
              </SegmentLink>
            ))}
          </Segmented>
          {scopeBadge}
        </div>
      }
    />
  );
}

export function HintSkeleton() {
  return <Skeleton as="span" className="inline-block h-4 w-64 max-w-full align-middle" />;
}
