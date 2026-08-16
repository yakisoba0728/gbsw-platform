"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { YEAR_INITIAL } from "./action-state";
import { createYearAction, setCurrentYearAction } from "./actions";

/*
 * 각 폼이 자기 결과를 직접 렌더한다.
 * 결과를 부모로 끌어올리면 자식 렌더 중에 부모 setState를 부르게 되어
 * "Cannot update a component while rendering a different component"로 터진다.
 */
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
      <h2 className="text-base font-extrabold text-ink">학년도</h2>
      <p className="mt-0.5 text-[12px] text-mut">
        모든 화면이 현재 학년도의 소속을 보여줍니다.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <form action={switchAction} className="flex items-end gap-2">
          {/* 폭은 바깥에서 준다 — cn()이 tailwind-merge가 아니라 Select의
              w-full을 className으로 덮을 수 없다. */}
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
              min={2000}
              max={2100}
              required
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={creating}>
            {creating ? "만드는 중…" : "학년도 추가"}
          </Button>
        </form>
      </div>

      {switchState.error && (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-rose">
          {switchState.error}
        </p>
      )}
      {createState.error && (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-rose">
          {createState.error}
        </p>
      )}
    </section>
  );
}
