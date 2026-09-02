import { Suspense } from "react";
import { AwardHistory } from "@/components/merit/award-history";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { TrackTabs } from "@/components/merit/track-tabs";
import { ChipLink } from "@/components/ui/chip-link";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import {
  SkeletonScreen,
  SkeletonStats,
  SkeletonTable,
} from "@/components/ui/skeleton";
import type { MeritTrack } from "@/core/authz/merit-track";
import { honorificName } from "@/core/authz/roles";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import type { StudentMeritView } from "@/modules/merit/award.service";
import { YearPicker } from "./year-picker";

type Params = SearchParamsInput;
type ChildOption = { studentProfileId: string; name: string };

type ViewPromise = Promise<StudentMeritView | null>;

export function OwnMeritView({
  title,
  track,
  viewPromise,
  yearsPromise,
  params,
  childOptions,
  selectedChild,
}: {
  title: string;
  track: MeritTrack;
  viewPromise: ViewPromise;
  yearsPromise: Promise<number[]> | null;
  params: Params;
  childOptions?: ChildOption[];
  selectedChild?: string;
}) {
  const boundaryKey = JSON.stringify([
    track,
    params.year ?? null,
    selectedChild ?? null,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title font-semibold text-ink">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <TrackTabs
            current={track}
            hrefFor={(next) =>
              hrefWith("/merit", params, {
                track: next,
                ...(next === "DORM" ? { year: null } : {}),
              })
            }
          />
          {childOptions && childOptions.length > 1 && (
            <ChildPicker
              options={childOptions}
              selected={selectedChild}
              params={params}
            />
          )}
        </div>
      </div>

      {yearsPromise && (
        <Suspense key={`years:${boundaryKey}`} fallback={null}>
          <YearChips
            yearsPromise={yearsPromise}
            viewPromise={viewPromise}
            params={params}
          />
        </Suspense>
      )}

      <Suspense
        key={`body:${boundaryKey}`}
        fallback={
          <SkeletonScreen className="space-y-4">
            <SkeletonStats count={3} />
            <SkeletonTable rows={6} />
          </SkeletonScreen>
        }
      >
        <OwnMeritResults promise={viewPromise} />
      </Suspense>
    </div>
  );
}

async function OwnMeritResults({ promise }: { promise: ViewPromise }) {
  const view = await promise;
  if (!view) return <NoAcademicYearNotice />;

  return (
    <>
      <MeritTotalsCards totals={view.totals} />

      <AwardHistory awards={view.awards} studentProfileId="" />
    </>
  );
}

async function YearChips({
  yearsPromise,
  viewPromise,
  params,
}: {
  yearsPromise: Promise<number[]>;
  viewPromise: ViewPromise;
  params: Params;
}) {
  const [years, view] = await Promise.all([yearsPromise, viewPromise]);
  if (!view) return null;

  return <YearPicker years={years} selected={view.year} params={params} />;
}

function ChildPicker({
  options,
  selected,
  params,
}: {
  options: ChildOption[];
  selected?: string;
  params: Params;
}) {
  function href(id: string): string {
    return hrefWith("/merit", params, { child: id, year: null });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((c) => (
        <ChipLink
          key={c.studentProfileId}
          size="sm"
          href={href(c.studentProfileId)}
          active={c.studentProfileId === selected}
        >
          {honorificName(c.name, "STUDENT")}
        </ChipLink>
      ))}
    </div>
  );
}
