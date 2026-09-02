import { Suspense } from "react";
import type { SessionUser } from "@/core/auth/session";
import {
  isYearScoped,
  MERIT_TRACK_TITLES,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { FilterRow } from "@/components/ui/filter-row";
import { ChipLink } from "@/components/ui/chip-link";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { PageHeader } from "@/components/ui/page-header";
import { SearchForm } from "@/components/ui/search-form";
import { SkeletonScreen, SkeletonTable } from "@/components/ui/skeleton";
import { StudentSearchResults } from "@/components/merit/student-search-results";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import {
  classRosterSchema,
  type ClassRosterInput,
} from "@/modules/merit/merit.schema";
import { getClassRoster, searchStudents } from "@/modules/merit/award.service";
import { listActiveRules } from "@/modules/merit/rule.service";
import { getDemeritThresholds } from "@/modules/merit/threshold.service";
import { TrackTabs } from "@/components/merit/track-tabs";
import { ClassRoster } from "./class-roster";

type Params = SearchParamsInput;

function meritHref(params: Params, patch: Record<string, string | null>): string {
  return hrefWith("/merit", params, patch);
}

function trackHrefFor(params: Params, track: MeritTrack): string {
  return hrefWith("/merit", params, {
    track,
    ...(track === "DORM" ? { year: null } : {}),
  });
}

export function AdminMeritView({
  actor,
  track,
  params,
}: {
  actor: SessionUser;
  track: MeritTrack;
  params: Params;
}) {
  const q = typeof params.q === "string" ? params.q : "";
  const trackHref = (next: MeritTrack) => trackHrefFor(params, next);

  const rosterQuery = classRosterSchema.safeParse({
    grade: params.grade,
    classNo: params.classNo,
    track,
    year: params.year,
  });
  const rosterScope: ClassRosterInput = rosterQuery.success
    ? rosterQuery.data
    : { track };

  const searchPromise = q ? loadSearch(actor, q) : null;
  const rosterPromise = loadRoster(actor, rosterScope);

  const searchKey = JSON.stringify({ q, track });
  const rosterKey = JSON.stringify(rosterScope);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={MERIT_TRACK_TITLES[track]}
        actions={<TrackTabs current={track} hrefFor={trackHref} />}
      />

      <Suspense key={`${searchKey}|${rosterKey}`} fallback={null}>
        <NoYearNotice search={searchPromise} roster={rosterPromise} />
      </Suspense>

      <SearchForm
        action="/merit"
        defaultValue={q}
        placeholder="학번 · 이름 · 학생코드로 검색"
        ariaLabel="학번 · 이름 · 학생코드로 학생 검색"
        hidden={{ track }}
      />

      {searchPromise && (
        <div className="space-y-2">
          <p className="text-caption text-mut">
            검색 결과는 전교를 대상으로 합니다. 아래 명단은 지금 고른 학년·반 범위를 그대로
            유지합니다.
          </p>
          <Suspense
            key={searchKey}
            fallback={
              <SkeletonScreen className="space-y-4">
                <SkeletonTable rows={3} />
              </SkeletonScreen>
            }
          >
            <SearchResults promise={searchPromise} track={track} />
          </Suspense>
        </div>
      )}

      <div className="@container">
        <div className="grid gap-4 @4xl:grid-cols-[2fr_1fr] @4xl:items-start">
          <div className="order-1 @4xl:col-start-1 @4xl:row-start-1">
            <ClassPicker params={params} track={track} />
          </div>

          <Suspense
            key={rosterKey}
            fallback={
              <SkeletonScreen className="order-2 @4xl:col-start-1 @4xl:row-start-2">
                <SkeletonTable rows={8} />
              </SkeletonScreen>
            }
          >
            <ClassRosterSection promise={rosterPromise} query={rosterScope} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

type SearchPromise = ReturnType<typeof loadSearch>;
type RosterPromise = ReturnType<typeof loadRoster>;

async function loadSearch(actor: SessionUser, q: string) {
  try {
    return await searchStudents(actor, q, { includeRemoved: true });
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return null;
  }
}

type RosterData = {
  rows: Awaited<ReturnType<typeof getClassRoster>>;
  rules: Awaited<ReturnType<typeof listActiveRules>>;
  thresholds: Awaited<ReturnType<typeof getDemeritThresholds>>;
  viewingPast: boolean;
};

async function loadRoster(
  actor: SessionUser,
  query: ClassRosterInput,
): Promise<RosterData | null> {
  let rows: RosterData["rows"];
  let rules: RosterData["rules"];
  let thresholds: RosterData["thresholds"];
  try {
    [rows, rules, thresholds] = await Promise.all([
      getClassRoster(actor, query),
      listActiveRules(actor, query.track),
      getDemeritThresholds(query.track),
    ]);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return null;
  }

  let viewingPast = false;
  if (isYearScoped(query.track) && query.year !== undefined) {
    try {
      viewingPast = query.year !== (await getCurrentYear());
    } catch (error) {
      if (!(error instanceof AcademicYearError)) throw error;
      viewingPast = true;
    }
  }

  return { rows, rules, thresholds, viewingPast };
}

async function NoYearNotice({
  search,
  roster,
}: {
  search: SearchPromise | null;
  roster: RosterPromise | null;
}) {
  const noYear =
    (search !== null && (await search) === null) ||
    (roster !== null && (await roster) === null);

  return noYear ? <NoAcademicYearNotice /> : null;
}

async function SearchResults({
  promise,
  track,
}: {
  promise: SearchPromise;
  track: MeritTrack;
}) {
  const rows = await promise;

  return (
    <StudentSearchResults
      rows={rows ?? []}
      hrefFor={(row) => `/students/${row.studentProfileId}?track=${track}`}
    />
  );
}

async function ClassRosterSection({
  promise,
  query,
}: {
  promise: RosterPromise;
  query: ClassRosterInput;
}) {
  const data = await promise;
  if (!data) return null;

  return (
    <ClassRoster
      key={`${query.track}-${query.year ?? "current"}-${query.grade}-${query.classNo}`}
      rows={data.rows}
      grade={query.grade}
      classNo={query.classNo}
      track={query.track}
      thresholds={data.thresholds}
      year={query.year}
      viewingPast={data.viewingPast}
      rules={data.rules}
    />
  );
}

const GRADES = [1, 2, 3];
const CLASS_NOS = [1, 2, 3, 4];

function ClassPicker({ params, track }: { params: Params; track: MeritTrack }) {
  const grade = typeof params.grade === "string" ? params.grade : "";
  const classNo = typeof params.classNo === "string" ? params.classNo : "";

  return (
    <div className="space-y-2.5">
      <FilterRow label="학년">
        <ChipLink
          size="sm"
          href={meritHref(params, { track, grade: null, classNo: null })}
          active={grade === ""}
        >
          전체
        </ChipLink>
        {GRADES.map((g) => (
          <ChipLink
            key={g}
            size="sm"
            href={meritHref(params, { track, grade: String(g) })}
            active={grade === String(g)}
          >
            {g}학년
          </ChipLink>
        ))}
      </FilterRow>
      {grade !== "" && (
        <FilterRow label="반">
          <ChipLink
            size="sm"
            href={meritHref(params, { track, classNo: null })}
            active={classNo === ""}
          >
            전체
          </ChipLink>
          {CLASS_NOS.map((c) => (
            <ChipLink
              key={c}
              size="sm"
              href={meritHref(params, { track, classNo: String(c) })}
              active={classNo === String(c)}
            >
              {c}반
            </ChipLink>
          ))}
        </FilterRow>
      )}
    </div>
  );
}
