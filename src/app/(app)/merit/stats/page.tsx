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

/** 각 갈래가 자기 promise 타입을 소유하고, 공통 껍데기에는 렌더할 조각만 넘긴다. */
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

/**
 * 탭 제목은 갈래를 따라가지 않는다 — **따라가게 만들 수 없다.**
 *
 * `generateMetadata`에 searchParams를 물려 갈래별 제목을 내 봤더니, 갈래 칩으로
 * 옮길 때 제목이 처음 값에 붙박인 채 바뀌지 않았다(주소와 화면은 바뀌는데
 * `document.title`만 남는다). 같은 경로에서 쿼리만 바뀌는 이동이라 라우터가
 * 캐시된 것을 그대로 쓴다. 틀린 제목이 붙어 있는 것보다 한 이름으로 두는 편이
 * 낫다 — 지금 보는 갈래는 화면 안의 켜진 칩이 답한다.
 */
export const metadata: Metadata = { title: "상벌점 통계" };

/** searchParams의 숫자 하나. 범위 밖이거나 숫자가 아니면 null(=조건 없음)이다. */
function numberParam(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

/**
 * 상벌점 통계 — 개요 · 순위·현황 · 교사별 · 규정별.
 *
 * 넷을 한 주소에 모으고 `?view=`로 고른다. 넷 다 같은 조회 조건(트랙·학년도,
 * 둘은 반까지)을 쓰는 같은 자료의 다른 각도라, 각도를 고르는 일이 화면 안에
 * 있어야 한다 — 교내·기숙사를 화면 안 탭으로 고르는 것과 같은 규칙이다.
 *
 * **아무것도 await 하지 않는다** — 한 번이라도 멈추면 이 함수 전체가 서지 못해
 * 트랙 탭·갈래 탭·범위 배지까지 통째로 뼈대가 된다. 기다림은 갈래마다 제
 * Suspense 경계 안에서만 일어난다.
 */
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

  // 반을 골랐으면 그 반만 본다. 둘 다 유효할 때만 적용한다 —
  // 하나만 있는 중간 상태는 전교로 떨어진다.
  const grade = numberParam(raw.grade, MIN_GRADE, MAX_GRADE);
  const classNo = numberParam(raw.classNo, MIN_CLASS_NO, MAX_CLASS_NO);
  const scope =
    STATS_VIEW_SCOPED[view] && grade !== null && classNo !== null
      ? { grade, classNo }
      : undefined;

  /** 지금 쿼리를 유지한 채 일부만 바꾼 주소. 트랙 탭·갈래 탭·반 선택이 함께 쓴다. */
  const href = (patch: Record<string, string | null>) =>
    hrefWith(PATH, raw as SearchParamsInput, patch);

  // 조건이 바뀌면 경계를 새로 만든다. 이미 해결된 Suspense 경계는 자식이 다시 매달려도
  // 뼈대 대신 옛 내용을 그대로 보여준다 — key가 없으면 탭을 눌러도 안 바뀐 것처럼 보인다.
  const boundaryKey = JSON.stringify({ view, track, year, grade, classNo });

  // 갈래 callback 안에서 promise 타입을 좁힌 채 힌트·본문이 같은 약속을 공유한다.
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

/** 갈래 네 갈래가 같은 껍데기를 쓴다 — 머리글 카드 + 본문. */
function Layout({ shell, children }: { shell: ShellProps; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <StatsShell {...shell} />
      {children}
    </div>
  );
}
