"use client";

import { useActionState, useState } from "react";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { MAX_YEAR, MIN_YEAR } from "@/modules/academic-year/academic-year.schema";
import { YEAR_INITIAL } from "./action-state";
import { createYearAction, setCurrentYearAction } from "./actions";

export function YearSwitcher({
  years,
}: {
  years: { year: number; isCurrent: boolean }[];
}) {
  const current = years.find((y) => y.isCurrent)?.year;
  const [selected, setSelected] = useState(
    String(current ?? years[0]?.year ?? ""),
  );
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
        <form
          action={switchAction}
          // React 폼 초기화가 제어 중인 선택값을 이전 학년도로 되돌리지 않게 한다.
          onReset={(event) => event.preventDefault()}
          className="flex items-end gap-2"
        >
          <div className="w-40">
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
          <ConfirmSubmit
            label="현재로 지정"
            title="현재 학년도 변경"
            description={`${selected}학년도를 현재로 지정합니다. 전교 집계와 명단이 이 학년도를 기준으로 바뀝니다.`}
            confirmLabel="지정"
            pendingLabel="바꾸는 중…"
            pending={switching}
            disabled={years.length === 0 || Number(selected) === current}
            variant="secondary"
            size="sm"
            full={false}
          />
        </form>

        <form action={createAction} className="flex items-end gap-2">
          <div className="w-28">
            <Input
              size="sm"
              type="number"
              name="year"
              aria-label="새 학년도"
              placeholder="2027"
              min={MIN_YEAR}
              max={MAX_YEAR}
              required
            />
          </div>
          <ConfirmSubmit
            label="추가"
            title="학년도 추가"
            description="새 학년도를 만듭니다. 현재 학년도는 그대로 둡니다."
            confirmLabel="추가"
            pendingLabel="만드는 중…"
            pending={creating}
            variant="secondary"
            size="sm"
            full={false}
          />
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
