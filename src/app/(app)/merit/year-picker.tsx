import Link from "next/link";

type Params = Record<string, string | string[] | undefined>;

function hrefWith(params: Params, year: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  query.set("track", "SCHOOL");
  query.set("year", String(year));
  return `/merit?${query.toString()}`;
}

/**
 * 교내 탭에서만 보인다 — 기숙사는 누적이라 고를 학년도가 없다.
 * 선택지는 **이 학생에게 기록이 있는 학년도들뿐**이다. 없는 해를 고를 수 있으면
 * 빈 화면만 나온다.
 */
export function YearPicker({
  years,
  selected,
  params,
}: {
  years: number[];
  selected: number | null;
  params: Params;
}) {
  if (years.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12px] font-semibold text-mut">학년도</span>
      {years.map((y) => (
        <Link
          key={y}
          href={hrefWith(params, y)}
          className={
            y === selected
              ? "rounded-full bg-pri px-3.5 py-1.5 text-[12.5px] font-bold text-white"
              : "rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-mut hover:border-pri hover:text-pri"
          }
        >
          {y}학년도
        </Link>
      ))}
    </div>
  );
}
