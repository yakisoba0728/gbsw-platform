import Link from "next/link";
import { AwardHistory } from "@/components/merit/award-history";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { MERIT_TRACK_LABELS, MERIT_TRACKS, type MeritTrack } from "@/core/authz/merit-track";
import type { StudentMeritView } from "@/modules/merit/award.service";
import { YearPicker } from "./year-picker";

type Params = Record<string, string | string[] | undefined>;
type ChildOption = { studentProfileId: string; name: string };

function hrefWithTrack(params: Params, track: MeritTrack): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // year는 트랙마다 의미가 다르다(교내만 쓴다) — 탭을 옮기면 지운다.
    if (typeof value === "string" && key !== "year") query.set(key, value);
  }
  query.set("track", track);
  return `/merit?${query.toString()}`;
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
        <h1 className="text-xl font-extrabold text-ink">{title}</h1>
        {childOptions && childOptions.length > 1 && (
          <ChildPicker options={childOptions} selected={selectedChild} params={params} />
        )}
      </div>

      <div className="flex items-center gap-2">
        {MERIT_TRACKS.map((t) => (
          <Link
            key={t}
            href={hrefWithTrack(params, t)}
            className={
              t === view.track
                ? "rounded-full bg-pri px-4 py-2 text-[13px] font-bold text-white"
                : "rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-mut hover:border-pri hover:text-pri"
            }
          >
            {MERIT_TRACK_LABELS[t]}
          </Link>
        ))}
      </div>

      {view.track === "SCHOOL" && (
        <YearPicker years={years} selected={view.year} params={params} />
      )}

      <MeritTotalsCards totals={view.totals} />

      {/* canCancel이 늘 false라 studentProfileId는 실제로 쓰이지 않는다 —
          StudentMeritView가 애초에 이 id를 담지 않는다(본인 조회에 불필요). */}
      <AwardHistory awards={view.awards} canCancel={false} studentProfileId="" />
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
  function href(id: string): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && key !== "child" && key !== "year") {
        query.set(key, value);
      }
    }
    query.set("child", id);
    return `/merit?${query.toString()}`;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((c) => (
        <Link
          key={c.studentProfileId}
          href={href(c.studentProfileId)}
          className={
            c.studentProfileId === selected
              ? "rounded-full bg-pri px-3.5 py-1.5 text-[12.5px] font-bold text-white"
              : "rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-mut hover:border-pri hover:text-pri"
          }
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}
