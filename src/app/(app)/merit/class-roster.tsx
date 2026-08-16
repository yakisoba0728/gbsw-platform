"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { TableFrame, tableCellPadding } from "@/components/ui/table";
import { signedNet, type MeritTrack } from "@/core/authz/merit-track";
import { RulePicker, type RuleOption } from "@/components/merit/rule-picker";
import { demeritCellClass, ThresholdHint } from "@/components/merit/demerit-level";
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
  offset: number;
  net: number;
};

export type { RuleOption };

type SortKey = "number" | "net";

/** 반 명단 + 일괄 부여. 정렬은 번호순이 기본이고, 순점수 헤더를 누르면 순점수순으로 바뀐다. */
export function ClassRoster({
  rows,
  grade,
  classNo,
  track,
  year,
  viewingPast,
  rules,
  today,
}: {
  rows: RosterRow[];
  grade: number;
  classNo: number;
  track: MeritTrack;
  year?: number;
  /** 지난 학년도를 보고 있는가. true면 부여 폼을 감춘다. */
  viewingPast: boolean;
  rules: RuleOption[];
  /** 오늘 날짜(KST, `YYYY-MM-DD`). 서버가 계산해 내려준다 (하이드레이션 불일치 방지). */
  today: string;
}) {
  const fieldId = useId();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [state, formAction, pending] = useActionState(bulkAwardAction, EMPTY_MERIT_STATE);
  // 고른 항목은 hidden input이 싣고 가지만, 제출 버튼을 잠그려면 화면도 알아야 한다.
  // 부여에 성공해도 비우지 않는다 — "점호 지각"을 다음 반에도 그대로 쓰는 흐름이다.
  const [rule, setRule] = useState<RuleOption | null>(null);

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
      <EmptyState>
        {grade}학년 {classNo}반에 학생이 없습니다.
      </EmptyState>
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
          <div className="hidden lg:block">
            <ThresholdHint track={track} />
          </div>
          <ExportButton grade={grade} classNo={classNo} track={track} year={year} />
        </header>

        <TableFrame
          minWidth={548}
          cols={[
            "w-[44px]",
            "w-[64px]",
            undefined,
            "w-[70px]",
            "w-[70px]",
            "w-[74px]",
            "w-[96px]",
          ]}
          /*
            정렬 상태는 <th> 자신이 갖는 속성이라 아래 <button> 안으로 내려보낼 수
            없다. 지금 정렬 중이 아닌 쪽도 "none"을 적어 둔다 — 값이 없으면
            "정렬할 수 있는 열"이라는 사실 자체가 전달되지 않는다.
          */
          sort={[
            undefined,
            sortKey === "number" ? "ascending" : "none",
            undefined,
            undefined,
            undefined,
            undefined,
            sortKey === "net" ? "descending" : "none",
          ]}
          headers={[
            <input
              key="all"
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="전체 선택"
              className="size-4 accent-pri"
            />,
            <SortButton
              key="number"
              label="번호"
              hint="번호 낮은 순"
              active={sortKey === "number"}
              onClick={() => setSortKey("number")}
            />,
            "이름",
            "상점",
            "벌점",
            /*
              상쇄점 열은 값이 0이어도 항상 낸다. 표는 행마다 열을 껐다 켤 수
              없고, 상점 − 벌점이 순점수와 안 맞는 줄이 하나라도 보이면
              보는 사람이 표 전체를 의심하게 된다.
            */
            "상쇄",
            <SortButton
              key="net"
              label="순점수"
              hint="순점수 높은 순"
              active={sortKey === "net"}
              onClick={() => setSortKey("net")}
            />,
          ]}
        >
          <tbody>
            {sorted.map((row) => (
              <tr key={row.studentProfileId} className="border-b border-line2 last:border-0">
                <td className={`${tableCellPadding(0, COLUMNS)} py-2.5`}>
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
                  <Link
                    href={`/merit/students/${row.studentProfileId}?track=${track}`}
                    className="font-semibold text-ink hover:text-pri hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 font-bold text-blue">{row.merit}</td>
                <td className="px-3 py-2.5">
                  <span className={demeritCellClass(track, row.demerit)}>
                    {row.demerit}
                  </span>
                </td>
                <td
                  className={`px-3 py-2.5 font-bold ${row.offset === 0 ? "text-mut2" : "text-green"}`}
                >
                  {row.offset}
                </td>
                <td
                  className={`${tableCellPadding(COLUMNS - 1, COLUMNS)} py-2.5 font-extrabold ${row.net >= 0 ? "text-green" : "text-rose"}`}
                >
                  {signedNet(row.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>

        {/*
          지난 학년도를 보고 있으면 부여 폼을 아예 감춘다 — 부여는 항상 현재
          학년도로 들어가므로, 2025년 명단을 보면서 주면 결과가 이 화면에
          나타나지 않는다. 학생 상세 화면과 같은 처리다.
        */}
        {viewingPast ? (
          <Note tone="warn" className="mx-5 my-4">
            지난 학년도를 보고 있습니다. 부여는 현재 학년도에만 할 수 있습니다.
          </Note>
        ) : (
        <div className="space-y-2.5 border-t border-line px-5 py-4">
          <span className="block text-[12.5px] font-semibold text-mut">
            {selected.size}명 선택됨
          </span>

          {/* 항목 고르기는 한 줄을 통째로 쓴다 — 검색 목록이 아래로 펼쳐진다. */}
          <RulePicker rules={rules} onChange={setRule} />

          <div className="flex flex-wrap items-end gap-2.5">
            {/* 한 묶음은 같은 날 일어난 일이다 — 발생일도 하나만 받는다. */}
            <div className="w-[150px]">
              <Label htmlFor={`${fieldId}-occurred`}>발생일</Label>
              <Input
                id={`${fieldId}-occurred`}
                type="date"
                name="occurredOn"
                defaultValue={today}
                max={today}
                required
              />
            </div>

            <div className="min-w-[160px] flex-1">
              <Input name="note" placeholder="메모 (선택)" aria-label="메모" />
            </div>

            <Button type="submit" disabled={pending || selected.size === 0 || !rule}>
              {pending ? "부여하는 중…" : "일괄 부여"}
            </Button>
          </div>
        </div>
        )}

        {state.error && (
          <Note tone="error" className="mx-5 mb-4">
            {state.error}
          </Note>
        )}
        {state.ok && state.count !== null && (
          <Note tone="success" className="mx-5 mb-4">
            {state.count}명에게 부여했습니다.
          </Note>
        )}
      </section>
    </form>
  );
}

/** 표의 열 수. 첫·끝 열 패딩 규칙(tableCellPadding)이 이 값을 본다. */
const COLUMNS = 7;

/**
 * 정렬 가능한 머리글.
 *
 * 전에는 `<th>`에 `onClick`만 있어서 **마우스 없이는 정렬을 바꿀 수 없었다** —
 * "순점수 낮은 순"으로 훑을 대체 경로가 화면에 아예 없었다. 실제 조작 대상을
 * `<button>`으로 만들어 탭 이동과 Enter·Space가 통하게 한다. 정렬 상태 자체는
 * 바깥 `<th>`의 `aria-sort`가 알린다(TableFrame의 `sort` 인자).
 */
function SortButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  /** 눌렀을 때 어떤 순서가 되는지. 화면에는 안 보이고 이름에만 붙는다. */
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} — ${hint}으로 정렬`}
      className={`-mx-1 rounded-btn px-1 py-1 font-semibold transition-colors hover:text-pri ${
        active ? "text-pri" : ""
      }`}
    >
      {label}
    </button>
  );
}
