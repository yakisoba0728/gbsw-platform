"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold text-ink">학년도</h2>
      <p className="mt-1 text-caption text-mut">
        모든 화면이 현재 학년도의 소속을 보여줍니다.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <form action={switchAction} className="flex items-end gap-2">
          {/* 폭은 바깥에서 준다 — cn()이 tailwind-merge가 아니라 w-full을 못 덮는다. */}
          <div className="w-36">
            <Select
              dense
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
              dense
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
        <p role="alert" className="mt-3 text-caption font-medium text-rose">
          {switchState.error}
        </p>
      )}
      {createState.error && (
        <p role="alert" className="mt-3 text-caption font-medium text-rose">
          {createState.error}
        </p>
      )}
    </section>
  );
}
