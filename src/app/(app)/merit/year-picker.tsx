import { ChipLink } from "@/components/ui/chip-link";
import { FilterRow } from "@/components/ui/filter-row";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";

type Params = SearchParamsInput;

function yearHref(basePath: string, params: Params, year: number): string {
  return hrefWith(basePath, params, { track: "SCHOOL", year: String(year) });
}

export function YearPicker({
  years,
  selected,
  params,
  basePath = "/merit",
}: {
  years: number[];
  selected: number | null;
  params: Params;
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
