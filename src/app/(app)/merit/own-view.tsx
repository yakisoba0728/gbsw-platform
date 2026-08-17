import { AwardHistory } from "@/components/merit/award-history";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { TrackTabs } from "@/components/merit/track-tabs";
import { ChipLink } from "@/components/ui/chip-link";
import type { MeritTrack } from "@/core/authz/merit-track";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import type { StudentMeritView } from "@/modules/merit/award.service";
import { YearPicker } from "./year-picker";

type Params = SearchParamsInput;
type ChildOption = { studentProfileId: string; name: string };

/** year는 트랙마다 의미가 다르다(교내만 쓴다) — 탭을 옮기면 지운다. */
function hrefWithTrack(params: Params, track: MeritTrack): string {
  return hrefWith("/merit", params, { track, year: null });
}

/** 학생·학부모 본인 조회. */
export function OwnMeritView({
  title,
  view,
  years,
  params,
  childOptions,
  selectedChild,
}: {
  title: string;
  view: StudentMeritView;
  years: number[];
  params: Params;
  childOptions?: ChildOption[];
  selectedChild?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* h1은 상단바가 (app)의 모든 화면에 이미 그린다 — 여기는 h2다. */}
        <h2 className="text-title font-semibold text-ink">{title}</h2>
        {childOptions && childOptions.length > 1 && (
          <ChildPicker options={childOptions} selected={selectedChild} params={params} />
        )}
      </div>

      <TrackTabs
        current={view.track}
        hrefFor={(t) => hrefWithTrack(params, t)}
      />

      {view.track === "SCHOOL" && (
        <YearPicker years={years} selected={view.year} params={params} />
      )}

      <MeritTotalsCards totals={view.totals} />

      {/* 취소 액션이 없으므로 "작업" 열도 없고 studentProfileId도 쓰이지 않는다. */}
      <AwardHistory awards={view.awards} studentProfileId="" />
    </div>
  );
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
          {c.name}
        </ChipLink>
      ))}
    </div>
  );
}
