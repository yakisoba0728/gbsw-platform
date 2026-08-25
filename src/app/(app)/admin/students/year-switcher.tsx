"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { MAX_YEAR, MIN_YEAR } from "@/modules/academic-year/academic-year.schema";
import { YEAR_INITIAL } from "./action-state";
import { createYearAction, setCurrentYearAction } from "./actions";

/** 각 폼이 자기 결과를 직접 렌더한다. 부모로 끌어올리면 렌더 중 setState로 터진다. */
export function YearSwitcher({
  years,
}: {
  years: { year: number; isCurrent: boolean }[];
}) {
  const current = years.find((y) => y.isCurrent)?.year;
  const [selected, setSelected] = useState(String(current ?? ""));
  const [switchState, switchAction, switching] = useActionState(
    setCurrentYearAction,
    YEAR_INITIAL,
  );
  const [createState, createAction, creating] = useActionState(
    createYearAction,
    YEAR_INITIAL,
  );

  return (
    <SectionCard variant="panel" title="학년도">
      <div className="flex flex-wrap items-end gap-4">
        <form action={switchAction} className="flex items-end gap-2">
          {/* 폭은 바깥에서 준다 — cn()이 tailwind-merge가 아니라 w-full을 못 덮는다. */}
          <div className="w-36">
            <Select
              size="sm"
              name="year"
              aria-label="현재 학년도"
              value={selected}
              onChange={(e) => setSelected(e.currentTarget.value)}
            >
              {years.map((y) => (
                <option key={y.year} value={y.year}>
                  {y.year}학년도{y.isCurrent ? " (현재)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={switching || Number(selected) === current}
          >
            {switching ? "바꾸는 중…" : "현재로 지정"}
          </Button>
        </form>

        <form action={createAction} className="flex items-end gap-2">
          <div className="w-28">
            <Input
              size="sm"
              type="number"
              name="year"
              aria-label="새 학년도"
              placeholder="2027"
              // 서버가 쓰는 상수를 그대로 쓴다 — 숫자를 다시 적으면 범위를
              // 넓힐 때 브라우저 검사만 옛 값에 남는다.
              min={MIN_YEAR}
              max={MAX_YEAR}
              required
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={creating}>
            {creating ? "만드는 중…" : "추가"}
          </Button>
        </form>
      </div>

      {switchState.error && (
        <Note tone="error" className="mt-3">
          {switchState.error}
        </Note>
      )}
      {createState.error && (
        <Note tone="error" className="mt-3">
          {createState.error}
        </Note>
      )}
    </SectionCard>
  );
}
