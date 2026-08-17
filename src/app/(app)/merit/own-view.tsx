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

/** 학생·학부모 본인 조회. Task 6의 MeritTotalsCards·AwardHistory를 그대로 재사용한다. */
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
        {/*
          <h2>다. 상단바(app-shell/topbar)가 (app) 안의 모든 화면에 이미 <h1>을
          그리므로, 여기서 또 <h1>을 두면 화면에 최상위 제목이 둘이 된다 —
          제목만 훑어 화면 구조를 파악하는 사람에게 어느 쪽이 이 화면인지가
          흐려진다. 글자 크기는 그대로 둔다(단계와 생김새는 별개다).
        */}
        <h2 className="text-xl font-extrabold text-ink">{title}</h2>
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

      {/* 취소 액션을 넘기지 않으므로 "작업" 열 자체가 없고, studentProfileId도
          실제로 쓰이지 않는다 — StudentMeritView가 애초에 이 id를 담지 않는다
          (본인 조회에 불필요). */}
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
  // 자녀를 바꾸면 학년도는 버린다 — 기록이 있는 학년도가 자녀마다 다르므로,
  // 들고 가면 그 해에 기록이 없는 자녀에게 빈 화면이 뜬다.
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
