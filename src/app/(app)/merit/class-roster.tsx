"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import {
  signedNet,
  type DemeritThresholds,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { RulePicker, type RuleOption } from "@/components/merit/rule-picker";
import {
  AwardSuccessDialog,
  type AwardSuccess,
} from "@/components/merit/award-success-dialog";
import { AwardConfirmDialog } from "@/components/merit/award-confirm-dialog";
import { DemeritCell } from "@/components/merit/demerit-level";
import { EMPTY_MERIT_STATE } from "./action-state";
import { bulkAwardAction } from "./actions";
import { ExportButton } from "./export-button";

export type RosterRow = {
  studentProfileId: string;
  studentCode: string;
  name: string;
  /** 반이 없는 학생도 명단에 남는다 — 그래서 null이 온다. */
  grade: number | null;
  classNo: number | null;
  number: number | null;
  merit: number;
  demerit: number;
  offset: number;
  net: number;
};

export type { RuleOption };

type SortKey = "number" | "net";

/**
 * 명단 + 일괄 부여. 정렬은 번호순이 기본이고, 순점수 헤더를 누르면 순점수순으로 바뀐다.
 *
 * 범위(학년·반)는 선택이다 — 안 고르면 전교가 온다. 그때는 번호만으로 누가 누군지
 * 알 수 없어 학급 열이 함께 선다.
 */
export function ClassRoster({
  rows,
  grade,
  classNo,
  track,
  thresholds,
  year,
  viewingPast,
  rules,
}: {
  rows: RosterRow[];
  /** 좁힌 범위. 없으면 전교(또는 그 학년 전체)다. */
  grade?: number;
  classNo?: number;
  track: MeritTrack;
  /** 벌점 강조 기준. 교사가 설정에서 정한 값을 서버가 내려준다. */
  thresholds: DemeritThresholds;
  year?: number;
  /** 지난 학년도를 보고 있는가. true면 부여 폼을 감춘다. */
  viewingPast: boolean;
  rules: RuleOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [state, formAction, pending] = useActionState(bulkAwardAction, EMPTY_MERIT_STATE);
  // 고른 항목은 hidden input이 싣고 가지만, 제출 버튼을 잠그려면 화면도 알아야 한다.
  const [rule, setRule] = useState<RuleOption | null>(null);

  // 부여 직전 확인. 메모는 확인창에 다시 세울 때만 필요해서 상태로 들지 않고
  // 열리는 순간 칸에서 읽는다 — 제어 입력으로 바꾸면 액션이 끝난 뒤의 자동 reset이
  // defaultValue를 따라가면서 화면과 상태가 어긋난다.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmNote, setConfirmNote] = useState("");
  // 확인창이 열려 있는 동안 온 오류만 담는다. `state.error`를 그대로 보여주면
  // 닫았다 다시 열었을 때 아직 누르지도 않은 부여가 실패한 것처럼 보인다.
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  // 성공 알림에 쓸 값. 제출한 순간을 찍어 둔다 — 성공하면 선택과 항목이 비워져
  // 그때 가서 읽으면 이미 없다.
  const [submitted, setSubmitted] = useState<AwardSuccess | null>(null);
  const [success, setSuccess] = useState<AwardSuccess | null>(null);

  /**
   * 체크박스를 새로 마운트시키는 열쇠. 액션이 끝나면 React가 폼을 reset하는데,
   * reset은 `defaultChecked`를 따르고 `checked`만 준 제어 체크박스는 그 값이
   * 갱신되지 않는다 — 화면만 풀리고 `selected`와 「N명 선택됨」은 그대로여서
   * 둘이 어긋난다. 새로 마운트하면 checked가 defaultChecked로 함께 심겨
   * reset이 아무것도 바꾸지 않는다. `checked`와 `defaultChecked`를 둘 다 주는
   * 해법은 쓰지 않는다 — React가 개발 콘솔에 경고를 낸다.
   *
   * 성공·실패를 가리지 않고 올린다. 실패한 뒤 남은 체크박스는 defaultChecked가
   * true로 심겨 있어, 그다음 성공에서 선택을 비워도 reset이 도로 켜 버린다.
   */
  const [checkboxKey, setCheckboxKey] = useState(0);

  // 일괄 부여가 성공하면 선택을 비운다. 렌더 중 비교로 처리한다 — effect 안에서
  // 곧바로 setState하면 리렌더가 한 번 더 발생한다.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    setCheckboxKey((n) => n + 1);
    if (state.ok) {
      setSelected(new Set());
      setConfirmOpen(false);
      setConfirmError(null);
      if (submitted) setSuccess({ ...submitted, count: state.count });
    } else {
      // 실패하면 확인창을 열어 둔다 — 오류가 그 안에 있고, 고른 학생이 그대로
      // 남아 고쳐서 다시 누를 수 있다. 이미 열려 있으면 아무 일도 없다.
      //
      // **다시 여는 것이 핵심이다.** 부여는 명단 반영과 잠금을 다투면 몇 초씩
      // 걸리고, 그 사이 Esc나 「닫기」로 창을 닫을 수 있다. 그때 오류가 오면
      // 실패가 앉을 자리가 어디에도 없어 조용히 사라진다.
      setConfirmOpen(true);
      setConfirmError(state.error);
    }
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

  // 범위를 좁히지 않았으면 번호만으로는 누구인지 모른다 — 학급을 함께 낸다.
  const showClass = classNo === undefined;
  const scopeLabel =
    grade === undefined
      ? "전교"
      : classNo === undefined
        ? `${grade}학년`
        : `${grade}학년 ${classNo}반`;

  if (rows.length === 0) {
    return <EmptyState>{scopeLabel}에 학생이 없습니다.</EmptyState>;
  }

  const columns: Column<RosterRow>[] = [
    {
      key: "select",
      header: (
        <SelectBox
          key={checkboxKey}
          checked={allSelected}
          onChange={toggleAll}
          label="전체 선택"
        />
      ),
      width: "w-[44px]",
      // 카드에서는 이름 오른쪽에 선다 — 여러 칸을 title로 쌓으면 이름 위에 얹힌다.
      card: "trailing",
      cell: (row) => (
        <SelectBox
          key={checkboxKey}
          checked={selected.has(row.studentProfileId)}
          onChange={() => toggleOne(row.studentProfileId)}
          label={`${row.name} 선택`}
        />
      ),
    },
    {
      key: "number",
      header: (
        <SortButton
          label="번호"
          hint="번호 낮은 순"
          active={sortKey === "number"}
          onClick={() => setSortKey("number")}
        />
      ),
      // 정렬 상태는 <th>의 속성이라 위 <button>으로 내려보낼 수 없다.
      // 정렬 중이 아닌 쪽도 "none"을 적는다 — 없으면 정렬 가능한 열임이 안 전달된다.
      sort: sortKey === "number" ? "ascending" : "none",
      width: "w-[64px]",
      card: "meta",
      cell: (row) => <span className="font-mono text-mut">{row.number ?? "—"}</span>,
    },
    ...(showClass
      ? [
          {
            key: "class",
            header: "학급",
            width: "w-[92px]",
            card: "meta" as const,
            // 반이 없는 학생도 명단에 남는다 — 그 자리를 빈칸이 아니라 말로 채운다.
            cell: (row: RosterRow) => (
              <span className="text-mut">
                {row.grade === null || row.classNo === null
                  ? "미배정"
                  : `${row.grade}-${row.classNo}`}
              </span>
            ),
          } satisfies Column<RosterRow>,
        ]
      : []),
    {
      key: "name",
      header: "이름",
      card: "title",
      cell: (row) => (
        <Link
          href={`/merit/students/${row.studentProfileId}?track=${track}`}
          className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: "merit",
      header: "상점",
      width: "w-[70px]",
      cell: (row) => <span className="font-medium text-blue">{row.merit}</span>,
    },
    {
      key: "demerit",
      header: "벌점",
      // 기준을 넘긴 칸은 테두리가 붙어 18px 넓어진다 — 세 자리 수가 상쇄 열을
      // 밀지 않게 상점 열보다 넓게 잡는다.
      width: "w-[84px]",
      card: "meta",
      cell: (row) => <DemeritCell thresholds={thresholds} demerit={row.demerit} />,
    },
    {
      // 상쇄 열은 0이어도 항상 낸다 — 상점 − 벌점이 순점수와 안 맞아 보이면 표를 의심하게 된다.
      key: "offset",
      header: "상쇄",
      width: "w-[74px]",
      cell: (row) => (
        <span
          className={`font-medium ${row.offset === 0 ? "text-mut2" : "text-green"}`}
        >
          {row.offset}
        </span>
      ),
    },
    {
      key: "net",
      header: (
        <SortButton
          label="순점수"
          hint="순점수 높은 순"
          active={sortKey === "net"}
          onClick={() => setSortKey("net")}
        />
      ),
      sort: sortKey === "net" ? "descending" : "none",
      width: "w-[96px]",
      card: "meta",
      cell: (row) => (
        <span
          className={`font-medium ${row.net >= 0 ? "text-green" : "text-rose"}`}
        >
          {signedNet(row.net)}
        </span>
      ),
    },
  ];

  return (
    <form action={formAction}>
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="studentProfileIds" value={id} />
      ))}

      <SectionCard
        flush
        title={scopeLabel}
        hint={`${rows.length}명`}
        aside={
          // 파일 이름이 「1학년3반」이라 한 반을 고른 때만 낼 수 있다.
          grade !== undefined && classNo !== undefined ? (
            <ExportButton grade={grade} classNo={classNo} track={track} year={year} />
          ) : undefined
        }
      >
        <DataTable
          minWidth={548}
          narrow="cards"
          rows={sorted}
          rowKey={(row) => row.studentProfileId}
          columns={columns}
        />

        {/* 지난 학년도를 보고 있으면 부여 폼을 감춘다 — 부여는 현재 학년도로만 들어간다. */}
        {viewingPast ? (
          <Note tone="warn" className="mx-5 my-4">
            부여는 현재 학년도에만 할 수 있습니다.
          </Note>
        ) : (
          <div className="@container space-y-2.5 border-t border-line px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-3">
              {/* 카드 목록에는 표 머리글이 없다 — 전체 선택을 여기 다시 낸다. */}
              <label className="inline-flex items-center gap-2 py-2.5 text-xs font-medium text-mut lg:hidden">
                <input
                  key={checkboxKey}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-4 accent-pri"
                />
                전체 선택
              </label>
              <span className="text-xs font-medium text-mut">
                {selected.size}명 선택됨
              </span>
            </div>

            {/* 항목 고르기는 한 줄을 통째로 쓴다 — 검색 목록이 아래로 펼쳐진다. */}
            <RulePicker rules={rules} onChange={setRule} />

            <div className="flex flex-col gap-2.5 @md:flex-row @md:flex-wrap @md:items-end">
              <div className="@md:min-w-[160px] @md:flex-1">
                {/* 실패 상태가 실어 온 제출값을 defaultValue로 내려보낸다 —
                    자동 reset이 메모를 지우는 대신 그 값으로 되돌린다. */}
                <Input
                  ref={noteRef}
                  name="note"
                  placeholder="메모 (선택)"
                  aria-label="메모"
                  defaultValue={state.note ?? ""}
                />
              </div>

              {/* 제출하지 않는다 — 확인창을 연다. 이름은 확인창의 버튼과 같다. */}
              <Button
                type="button"
                className="w-full @md:w-auto"
                disabled={pending || selected.size === 0 || !rule}
                onClick={() => {
                  setConfirmNote(noteRef.current?.value.trim() ?? "");
                  setConfirmError(null);
                  setConfirmOpen(true);
                }}
              >
                부여
              </Button>
            </div>
          </div>
        )}

        {/* 폼 안에 둔다 — 확인 버튼이 이 폼을 제출한다. */}
        {rule && (
          <AwardConfirmDialog
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            rule={rule}
            note={confirmNote}
            students={rows.filter((row) => selected.has(row.studentProfileId))}
            showClass={showClass}
            pending={pending}
            error={confirmError}
            onConfirm={() => setSubmitted({ ...rule, count: selected.size })}
          />
        )}

        <AwardSuccessDialog
          result={success}
          onClose={() => setSuccess(null)}
        />
      </SectionCard>
    </form>
  );
}

/**
 * 명단 체크박스. `<label>`이 감싸 실제 탭 영역을 36px로 넓힌다 — 상자 자체는
 * 16px이고 사감은 어두운 복도에서 이걸 누른다.
 */
function SelectBox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  /** 접근 가능한 이름. <label>에 글자가 없으므로 input이 직접 갖는다. */
  label: string;
}) {
  return (
    <label className="-m-2.5 inline-flex cursor-pointer p-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="size-4 accent-pri"
      />
    </label>
  );
}

/**
 * 정렬 가능한 머리글. 조작 대상이 <button>이라야 탭 이동과 Enter·Space가 통한다.
 * 정렬 상태 자체는 바깥 <th>의 aria-sort가 알린다.
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
      className={`-mx-2 -my-1 rounded-btn px-2 py-2.5 font-medium transition-colors hover:text-ink ${
        active ? "text-ink underline decoration-line-strong underline-offset-2" : ""
      }`}
    >
      {label}
    </button>
  );
}
