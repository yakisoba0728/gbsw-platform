import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission, type SessionUser } from "@/core/auth/session";
import { isMeritTrack, type MeritTrack } from "@/core/authz/merit-track";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import {
  MAX_CLASS_NO,
  MAX_GRADE,
  MIN_CLASS_NO,
  MIN_GRADE,
} from "@/modules/enrollment/enrollment.schema";
import { HintSkeleton, StatsShell } from "./stats-shell";
import { parseStatsView, STATS_VIEW_SCOPED, type StatsView } from "./stats-view";
import { loadOverview, OverviewBody, OverviewHint, OverviewSkeleton } from "./views/overview";
import { loadRanking, RankingBody, RankingHint, RankingSkeleton } from "./views/ranking";
import { loadRules, RulesBody, RulesHint, RulesSkeleton } from "./views/rules";
import {
  loadTeachers,
  TeachersBody,
  TeachersHint,
  TeachersSkeleton,
} from "./views/teachers";

const PATH = "/merit/stats";

type RawParams = Record<string, string | string[] | undefined>;
type Scope = { grade: number; classNo: number };
type Patch = Record<string, string | null>;

type ViewContext = {
  actor: SessionUser;
  track: MeritTrack;
  year: number | undefined;
  scope: Scope | undefined;
  href: (patch: Patch) => string;
};

type ViewBranch = {
  hint: React.ReactNode;
  body: React.ReactNode;
  fallback: React.ReactNode;
};

const VIEW_BRANCHES = {
  overview: ({ actor, track, year, scope, href }: ViewContext): ViewBranch => {
    const promise = loadOverview(actor, track, year, scope);
    return {
      hint: <OverviewHint promise={promise} track={track} />,
      body: <OverviewBody promise={promise} track={track} statsHref={href} />,
      fallback: <OverviewSkeleton />,
    };
  },
  ranking: ({ actor, track, year, scope, href }: ViewContext): ViewBranch => {
    const promise = loadRanking(actor, track, year, scope);
    return {
      hint: <RankingHint promise={promise} track={track} />,
      body: <RankingBody promise={promise} track={track} href={href} />,
      fallback: <RankingSkeleton scoped={scope !== undefined} />,
    };
  },
  teachers: ({ actor, track, year }: ViewContext): ViewBranch => {
    const promise = loadTeachers(actor, track, year);
    return {
      hint: <TeachersHint promise={promise} track={track} />,
      body: <TeachersBody promise={promise} />,
      fallback: <TeachersSkeleton />,
    };
  },
  rules: ({ actor, track, year }: ViewContext): ViewBranch => {
    const promise = loadRules(actor, track, year);
    return {
      hint: <RulesHint promise={promise} />,
      body: <RulesBody promise={promise} track={track} />,
      fallback: <RulesSkeleton />,
    };
  },
} satisfies Record<StatsView, (context: ViewContext) => ViewBranch>;

export const metadata: Metadata = { title: "상벌점 통계" };

function numberParam(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

export default async function MeritStatsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const actor = await requirePermission("merit:read:any");

  const raw = await searchParams;
  const view = parseStatsView(raw.view);
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  const year =
    typeof raw.year === "string" && /^\d{4}$/.test(raw.year) ? Number(raw.year) : undefined;

  const grade = numberParam(raw.grade, MIN_GRADE, MAX_GRADE);
  const classNo = numberParam(raw.classNo, MIN_CLASS_NO, MAX_CLASS_NO);
  const scope =
    STATS_VIEW_SCOPED[view] && grade !== null && classNo !== null
      ? { grade, classNo }
      : undefined;

  const href = (patch: Record<string, string | null>) =>
    hrefWith(PATH, raw as SearchParamsInput, patch);

  const boundaryKey = JSON.stringify({ view, track, year, grade, classNo });

  const branch = VIEW_BRANCHES[view]({ actor, track, year, scope, href });

  return (
    <Layout
      shell={{
        view,
        track,
        href,
        scope,
        hint: (
          <Suspense key={`hint:${boundaryKey}`} fallback={<HintSkeleton />}>
            {branch.hint}
          </Suspense>
        ),
      }}
    >
      <Suspense key={`body:${boundaryKey}`} fallback={branch.fallback}>
        {branch.body}
      </Suspense>
    </Layout>
  );
}

type ShellProps = {
  view: StatsView;
  track: MeritTrack;
  href: (patch: Record<string, string | null>) => string;
  scope?: { grade: number; classNo: number };
  hint: React.ReactNode;
};

function Layout({ shell, children }: { shell: ShellProps; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <StatsShell {...shell} />
      {children}
    </div>
  );
}
