"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { MeritTrack } from "@/core/authz/merit-track";
import { EMPTY_MERIT_STATE } from "./action-state";
import { bulkAwardAction } from "./actions";
import { ExportButton } from "./export-button";

export type RosterRow = {
  studentProfileId: string;
  studentCode: string;
  name: string;
  number: number | null;
  merit: number;
  demerit: number;
  net: number;
};

export type RuleOption = {
  id: string;
  kind: string;
  label: string;
  points: number;
  category: string | null;
};

const optionLabel = (rule: RuleOption) =>
  `[${rule.kind === "MERIT" ? "상" : "벌"} ${rule.points}점] ${rule.label}`;

type SortKey = "number" | "net";

/** 반 명단 + 일괄 부여. 정렬은 번호순이 기본이고, 순점수 헤더를 누르면 순점수순으로 바뀐다. */
export function ClassRoster({
  rows,
  grade,
  classNo,
  track,
  year,
  rules,
}: {
  rows: RosterRow[];
  grade: number;
  classNo: number;
  track: MeritTrack;
  year?: number;
  rules: RuleOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [state, formAction, pending] = useActionState(bulkAwardAction, EMPTY_MERIT_STATE);

  // 일괄 부여가 성공하면 선택을 비운다. 렌더 중 이전 상태와 비교해 처리한다 —
  // useEffect 안에서 곧바로 setState하면 리렌더가 한 번 더 발생한다
  // (react-hooks/set-state-in-effect, rule-table.tsx와 같은 패턴).
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setSelected(new Set());
  }

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortKey === "net") {
      copy.sort((a, b) => b.net - a.net);
    } else {
      copy.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    }
    return copy;
  }, [rows, sortKey]);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.studentProfileId)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center text-[12.5px] text-mut">
        {grade}학년 {classNo}반에 학생이 없습니다.
      </div>
    );
  }

  return (
    <form action={formAction}>
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="studentProfileIds" value={id} />
      ))}

      <section className="rounded-card border border-line bg-surface">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-extrabold text-ink">
              {grade}학년 {classNo}반
            </h2>
            <span className="text-[12px] text-mut">{rows.length}명</span>
          </div>
          <ExportButton grade={grade} classNo={classNo} track={track} year={year} />
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[64px]" />
              <col />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[84px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-line2 text-[12px] text-mut">
                <th className="px-5 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="전체 선택"
                    className="size-4 accent-pri"
                  />
                </th>
                <th
                  className="cursor-pointer px-3 py-2.5 font-semibold select-none"
                  onClick={() => setSortKey("number")}
                >
                  번호
                </th>
                <th className="px-3 py-2.5 font-semibold">이름</th>
                <th className="px-3 py-2.5 font-semibold">상점</th>
                <th className="px-3 py-2.5 font-semibold">벌점</th>
                <th
                  className="cursor-pointer px-3 py-2.5 font-semibold select-none"
                  onClick={() => setSortKey("net")}
                >
                  순점수
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.studentProfileId} className="border-b border-line2 last:border-0">
                  <td className="px-5 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(row.studentProfileId)}
                      onChange={() => toggleOne(row.studentProfileId)}
                      aria-label={`${row.name} 선택`}
                      className="size-4 accent-pri"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-mut">{row.number ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <a
                      href={`/merit/students/${row.studentProfileId}?track=${track}`}
                      className="font-semibold text-ink hover:text-pri hover:underline"
                    >
                      {row.name}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 font-bold text-blue">{row.merit}</td>
                  <td className="px-3 py-2.5 font-bold text-rose">{row.demerit}</td>
                  <td
                    className={`px-3 py-2.5 font-extrabold ${row.net >= 0 ? "text-green" : "text-rose"}`}
                  >
                    {row.net >= 0 ? "+" : ""}
                    {row.net}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-end gap-2.5 border-t border-line px-5 py-4">
          <span className="mr-1 text-[12.5px] font-semibold text-mut">
            {selected.size}명 선택됨
          </span>

          <div className="min-w-[220px] flex-[2]">
            <Select name="ruleId" required defaultValue="" aria-label="부여 항목">
              <option value="" disabled>
                항목 선택
              </option>
              {rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {optionLabel(rule)}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-[160px] flex-[2]">
            <Input name="note" placeholder="메모 (선택)" aria-label="메모" />
          </div>

          <Button type="submit" disabled={pending || selected.size === 0}>
            {pending ? "부여하는 중…" : "일괄 부여"}
          </Button>
        </div>

        {state.error && (
          <p role="alert" className="mx-5 mb-4 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose">
            {state.error}
          </p>
        )}
        {state.ok && state.count !== null && (
          <p className="mx-5 mb-4 rounded-btn bg-green-soft px-3 py-2.5 text-[13px] font-semibold text-green">
            {state.count}명에게 부여했습니다.
          </p>
        )}
      </section>
    </form>
  );
}
