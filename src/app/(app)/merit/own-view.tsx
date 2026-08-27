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
import { pageClass } from "@/components/ui/page-shell";

type Params = SearchParamsInput;
type ChildOption = { studentProfileId: string; name: string };

/** 현재 학년도가 없으면 null. 페이지가 그렇게 만들어 넘긴다. */
type ViewPromise = Promise<StudentMeritView | null>;

/**
 * 학생·학부모 본인 조회. 조회 결과를 **기다리지 않고 약속으로 받는다** — 기다리면
 * 제목과 트랙 탭까지 함께 멈춰, 탭을 누른 사람이 자기가 무엇을 눌렀는지 잃는다.
 */
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
  /** 교내에만 있다 — 기숙사는 누적이라 고를 학년도가 없다. */
  yearsPromise: Promise<number[]> | null;
  params: Params;
  childOptions?: ChildOption[];
  selectedChild?: string;
}) {
  // 결과를 가르는 조건은 셋뿐이다. 이미 해결된 Suspense 경계는 자식이 다시 매달려도
  // 뼈대 대신 옛 내용을 그대로 보여주므로, 조건이 바뀌면 경계를 새로 만든다.
  const boundaryKey = JSON.stringify([
    track,
    params.year ?? null,
    selectedChild ?? null,
  ]);

  return (
    <div className={pageClass("wide", "space-y-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* h1은 상단바가 (app)의 모든 화면에 이미 그린다 — 여기는 h2다. */}
        <h2 className="text-title font-semibold text-ink">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <TrackTabs
            current={track}
            hrefFor={(next) =>
              hrefWith("/merit", params, {
                track: next,
                // 기숙사는 누적이라 학년도가 의미 없다.
                ...(next === "DORM" ? { year: null } : {}),
              })
            }
            size="sm"
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
        // 고르는 자리지만 선택지도 "지금 보는 해"도 조회에서 나온다 — 결과와 같은
        // 약속을 나눠 기다리는 작은 경계를 그 자리에 둔다. 대개 비어 있어 뼈대는 없다.
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

/** 합계와 내역. 학년도·트랙을 바꿀 때 뼈대로 바뀌는 것은 여기까지다. */
async function OwnMeritResults({ promise }: { promise: ViewPromise }) {
  const view = await promise;
  // 학년도가 없으면 합계도 내역도 셀 수 없다. 안내가 결과 자리를 대신하고 탭은 남는다 —
  // 기숙사 쪽은 학년도 없이도 읽히므로 그리로 갈 길을 막지 않는다.
  if (!view) return <NoAcademicYearNotice />;

  return (
    <>
      <MeritTotalsCards totals={view.totals} />

      {/* 취소 액션이 없으므로 "작업" 열도 없고 studentProfileId도 쓰이지 않는다. */}
      <AwardHistory awards={view.awards} studentProfileId="" />
    </>
  );
}

/** 학년도 칩. 지금 고른 해는 조회가 정한다(안 골랐으면 현재 학년도). */
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
  // 자녀를 바꾸면 학년도는 버린다 — 기록이 있는 해가 자녀마다 달라 빈 화면이 뜬다.
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
