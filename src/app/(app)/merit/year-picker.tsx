import { ChipLink } from "@/components/ui/chip-link";
import { FilterRow } from "@/components/ui/filter-row";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";

type Params = SearchParamsInput;

/** 학년도는 교내에만 있다 — 고르는 순간 트랙도 교내로 못 박는다. */
function yearHref(basePath: string, params: Params, year: number): string {
  return hrefWith(basePath, params, { track: "SCHOOL", year: String(year) });
}

/**
 * 교내 탭에서만 보인다 — 기숙사는 누적이라 고를 학년도가 없다.
 * 선택지는 이 학생에게 기록이 있는 학년도들뿐이다.
 */
export function YearPicker({
  years,
  selected,
  params,
  basePath = "/merit",
}: {
  years: number[];
  selected: number | null;
  params: Params;
  /** 학생 상세(`/merit/students/<id>`)에서도 쓰므로 경로를 받는다. */
  basePath?: string;
}) {
  if (years.length === 0) return null;

  return (
    <FilterRow label="학년도">
      {years.map((y) => (
        <ChipLink
          key={y}
          size="sm"
          href={yearHref(basePath, params, y)}
          active={y === selected}
        >
          {y}학년도
        </ChipLink>
      ))}
    </FilterRow>
  );
}
