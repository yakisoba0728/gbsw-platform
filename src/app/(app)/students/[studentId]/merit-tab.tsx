import Link from "next/link";
import { Suspense } from "react";
import type { SessionUser } from "@/core/auth/session";
import { isMeritTrack, isYearScoped, type MeritTrack } from "@/core/authz/merit-track";
import { ForbiddenError } from "@/core/authz/errors";
import { AwardHistory } from "@/components/merit/award-history";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { TrackTabs } from "@/components/merit/track-tabs";
import { buttonClass } from "@/components/ui/button";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { Note } from "@/components/ui/note";
import {
  Skeleton,
  SkeletonScreen,
  SkeletonStats,
  SkeletonTable,
} from "@/components/ui/skeleton";
import type { SearchParamsInput } from "@/lib/search-params";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import { getStudentMerit, listAwardYears } from "@/modules/merit/award.service";
import { listActiveRules } from "@/modules/merit/rule.service";
import { EMPTY_MERIT_STATE } from "@/app/(app)/merit/action-state";
import { cancelAction } from "@/app/(app)/merit/actions";
import { ExportHistoryButton } from "@/app/(app)/merit/export-button";
import { YearPicker } from "@/app/(app)/merit/year-picker";
import { AwardForm } from "./award-form";
import { studentHref } from "./student-tab";

type Params = SearchParamsInput;

type MeritLoad = {
  view: ReturnType<typeof getStudentMerit>;
  rules: ReturnType<typeof listActiveRules>;
};

function trackHref(studentId: string, params: Params, track: MeritTrack): string {
  return studentHref(studentId, params, {
    track,
    ...(track === "DORM" ? { year: null } : {}),
  });
}

async function readView(promise: MeritLoad["view"]) {
  try {
    return await promise;
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return null;
  }
}

export function MeritTab({
  actor,
  studentId,
  params,
  removed,
  noCurrentYear,
}: {
  actor: SessionUser;
  studentId: string;
  params: Params;
  removed: boolean;
  noCurrentYear: boolean;
}) {
  const track: MeritTrack = isMeritTrack(params.track) ? params.track : "SCHOOL";
  const year =
    typeof params.year === "string" && /^\d{4}$/.test(params.year)
      ? Number(params.year)
      : undefined;

  const load: MeritLoad | null = noCurrentYear
    ? null
    : {
        view: getStudentMerit(actor, studentId, track, year),
        rules: listActiveRules(actor, track).catch((error) => {
          if (error instanceof ForbiddenError) return [];
          throw error;
        }),
      };

  const awardYearsPromise = isYearScoped(track)
    ? listAwardYears(actor, studentId)
    : null;

  const boundaryKey = JSON.stringify({ track, year: year ?? null });

  return (
    <div className="space-y-4">
      <TrackTabs
        current={track}
        hrefFor={(t) => trackHref(studentId, params, t)}
      />

      {removed && (
        <Note tone="warn">
          재학 중이 아닌 학생에게는 새 상벌점을 부여할 수 없습니다.
        </Note>
      )}

      {awardYearsPromise && (
        <Suspense key={`years:${boundaryKey}`} fallback={null}>
          <StudentYearPicker
            yearsPromise={awardYearsPromise}
            viewPromise={load?.view ?? null}
            params={params}
            studentId={studentId}
          />
        </Suspense>
      )}

      <Suspense key={`body:${boundaryKey}`} fallback={<StudentMeritSkeleton />}>
        <StudentMeritBody
          load={load}
          studentId={studentId}
          track={track}
          year={year}
          removed={removed}
        />
      </Suspense>
    </div>
  );
}

function StudentMeritSkeleton() {
  return (
    <SkeletonScreen className="space-y-4">
      <SkeletonStats count={3} />
      <Skeleton className="h-[180px]" />
      <SkeletonTable />
    </SkeletonScreen>
  );
}

async function StudentYearPicker({
  yearsPromise,
  viewPromise,
  params,
  studentId,
}: {
  yearsPromise: ReturnType<typeof listAwardYears>;
  viewPromise: MeritLoad["view"] | null;
  params: Params;
  studentId: string;
}) {
  const [years, view] = await Promise.all([
    yearsPromise,
    viewPromise ? readView(viewPromise) : null,
  ]);

  return (
    <YearPicker
      years={years}
      selected={view?.year ?? null}
      params={params}
      basePath={`/students/${studentId}`}
    />
  );
}

async function StudentMeritBody({
  load,
  studentId,
  track,
  year,
  removed,
}: {
  load: MeritLoad | null;
  studentId: string;
  track: MeritTrack;
  year: number | undefined;
  removed: boolean;
}) {
  if (!load) return <NoAcademicYearNotice />;

  const [view, rules] = await Promise.all([readView(load.view), load.rules]);
  if (!view) return <NoAcademicYearNotice />;

  let viewingPast = false;
  if (isYearScoped(track) && year !== undefined) {
    try {
      viewingPast = year !== (await getCurrentYear());
    } catch (error) {
      if (!(error instanceof AcademicYearError)) throw error;
      viewingPast = true;
    }
  }

  return (
    <>
      <MeritTotalsCards totals={view.totals} />

      {removed || rules.length === 0 ? null : viewingPast ? (
        <Note tone="warn">부여는 현재 학년도에만 할 수 있습니다.</Note>
      ) : (
        <AwardForm studentProfileId={studentId} rules={rules} />
      )}

      <AwardHistory
        awards={view.awards}
        studentProfileId={studentId}
        cancelAction={cancelAction}
        initialState={EMPTY_MERIT_STATE}
      />

      <div className="flex flex-wrap gap-2">
        <ExportHistoryButton
          studentProfileId={studentId}
          track={track}
          year={year}
        />
        <Link
          href={`/students/${studentId}/print?track=${track}${year ? `&year=${year}` : ""}`}
          className={buttonClass({ variant: "secondary" })}
        >
          확인서
        </Link>
      </div>
    </>
  );
}
