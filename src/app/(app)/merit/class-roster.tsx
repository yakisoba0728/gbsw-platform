"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/truncated-text";
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
import { formatSeat } from "@/lib/student-number";
import { EMPTY_MERIT_STATE } from "./action-state";
import { bulkAwardAction } from "./actions";
import { ExportButton } from "./export-button";
import { honorificName } from "@/core/authz/roles";

export type RosterRow = {
  studentProfileId: string;
  studentCode: string;
  name: string;
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
  grade?: number;
  classNo?: number;
  track: MeritTrack;
  thresholds: DemeritThresholds;
  year?: number;
  viewingPast: boolean;
  rules: RuleOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [state, formAction, pending] = useActionState(bulkAwardAction, EMPTY_MERIT_STATE);
  const [rule, setRule] = useState<RuleOption | null>(null);
  const awardPanelRef = useRef<HTMLDivElement>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmNote, setConfirmNote] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  const [submitted, setSubmitted] = useState<AwardSuccess | null>(null);
  const [success, setSuccess] = useState<AwardSuccess | null>(null);

  const [checkboxKey, setCheckboxKey] = useState(0);

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
      setConfirmOpen(true);
      setConfirmError(state.error);
    }
  }

  const sorted = useMemo(
    () => (sortKey === "net" ? [...rows].sort((a, b) => b.net - a.net) : rows),
    [rows, sortKey],
  );

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

  const showClass = classNo === undefined;
  const scopeLabel =
    grade === undefined
      ? "전교"
      : classNo === undefined
        ? `${grade}학년`
        : `${grade}학년 ${classNo}반`;

  if (rows.length === 0) {
    return (
      <SectionCard flush title={scopeLabel} hint="0명">
        <EmptyState variant="inside">{scopeLabel}에 학생이 없습니다.</EmptyState>
      </SectionCard>
    );
  }

  const columns: Column<RosterRow>[] = [
    {
      key: "select",
      header: (
        <Checkbox
          key={checkboxKey}
          checked={allSelected}
          onChange={toggleAll}
          label="전체 선택"
        />
      ),
      width: "w-[44px]",
      card: "trailing",
      cell: (row) => (
        <Checkbox
          key={checkboxKey}
          checked={selected.has(row.studentProfileId)}
          onChange={() => toggleOne(row.studentProfileId)}
          label={`${honorificName(row.name, "STUDENT")} 선택`}
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
      sort: sortKey === "number" ? "ascending" : "none",
      width: "w-[64px]",
      card: "meta",
      cell: (row) => <span className="tabular-nums text-mut">{row.number ?? "—"}</span>,
    },
    ...(showClass
      ? [
          {
            key: "class",
            header: "학급",
            width: "w-[92px]",
            card: "meta" as const,
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
          href={`/students/${row.studentProfileId}?track=${track}`}
          className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
        >
          {honorificName(row.name, "STUDENT")}
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
      width: "w-[84px]",
      card: "meta",
      cell: (row) => <DemeritCell thresholds={thresholds} demerit={row.demerit} />,
    },
    {
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

  const chosen = rows.filter((row) => selected.has(row.studentProfileId));
  const noneChosen = selected.size === 0;

  return (
    <form action={formAction} className="contents">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="studentProfileIds" value={id} />
      ))}

      <div className="order-2 @4xl:col-start-1 @4xl:row-start-2">
        <SectionCard
          flush
          title={scopeLabel}
          hint={`${rows.length}명`}
          aside={
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
        </SectionCard>

        {!viewingPast && selected.size > 0 && (
          <div className="fixed bottom-20 left-1/2 z-40 flex w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-card border border-pri-line bg-surface px-4 py-3 shadow-float lg:bottom-4 @4xl:hidden">
            <p className="text-caption font-medium text-ink" role="status">
              {selected.size}명 선택됨
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                awardPanelRef.current?.scrollIntoView({ block: "start" });
                awardPanelRef.current?.focus({ preventScroll: true });
              }}
            >
              부여 설정으로
            </Button>
          </div>
        )}
      </div>

      <div
        ref={awardPanelRef}
        tabIndex={-1}
        className="order-3 scroll-mt-4 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink @4xl:col-start-2 @4xl:row-start-1 @4xl:row-span-2 @4xl:sticky @4xl:top-4"
      >
        {viewingPast ? (
          <SectionCard variant="panel" title="상벌점 부여" headingLevel={3}>
            <Note tone="warn">부여는 현재 학년도에만 할 수 있습니다.</Note>
          </SectionCard>
        ) : (
          <SectionCard
            variant="panel"
            title="상벌점 부여"
            headingLevel={3}
            aside={
              <span className="text-xs font-medium text-mut">
                {selected.size}명 선택됨
              </span>
            }
          >
            <div className="relative">
              <div
                className={
                  noneChosen
                    ? "space-y-2.5 blur-[2px] select-none"
                    : "space-y-2.5"
                }
                inert={noneChosen}
              >
                <CheckboxField
                  key={checkboxKey}
                  label="전체 선택"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="@4xl:hidden"
                />

                <RulePicker rules={rules} onChange={setRule} />

                <Input
                  ref={noteRef}
                  name="note"
                  placeholder="메모 (선택)"
                  aria-label="메모"
                  defaultValue={state.note ?? ""}
                />

                <Button
                  type="button"
                  full
                  disabled={pending || noneChosen || !rule}
                  onClick={() => {
                    setConfirmNote(noteRef.current?.value.trim() ?? "");
                    setConfirmError(null);
                    setConfirmOpen(true);
                  }}
                >
                  부여
                </Button>

                {chosen.length > 0 && (
                  <ChosenList students={chosen} showClass={showClass} />
                )}
              </div>

              {noneChosen && (
                <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-caption font-medium text-mut">
                  대상 학생을 먼저 추가하세요
                </p>
              )}
            </div>
          </SectionCard>
        )}
      </div>

      {state.error && (
        <Note tone="error" className="order-4 @4xl:col-span-2">
          {state.error}
        </Note>
      )}

      {rule && (
        <AwardConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          rule={rule}
          note={confirmNote}
          students={chosen}
          showClass={showClass}
          scopeLabel={scopeLabel}
          pending={pending}
          error={confirmError}
          onConfirm={() => setSubmitted({ ...rule, count: selected.size })}
        />
      )}

      <AwardSuccessDialog result={success} onClose={() => setSuccess(null)} />
    </form>
  );
}

function ChosenList({
  students,
  showClass,
}: {
  students: RosterRow[];
  showClass: boolean;
}) {
  return (
    <ul className="max-h-52 divide-y divide-line2 overflow-y-auto rounded-card border border-line">
      {students.map((student) => (
        <li
          key={student.studentProfileId}
          className="flex items-center gap-2.5 px-4 py-2 text-caption"
        >
          <span className="flex shrink-0 items-baseline gap-2 text-xs text-mut2">
            {showClass ? (
              <span className="w-10 tabular-nums">
                {formatSeat(student) ?? "미배정"}
              </span>
            ) : (
              <span className="w-5 text-right tabular-nums">
                {student.number ?? "—"}
              </span>
            )}
          </span>
          <TruncatedText
            full={honorificName(student.name, "STUDENT")}
            className="font-medium text-ink"
          >
            {honorificName(student.name, "STUDENT")}
          </TruncatedText>
        </li>
      ))}
    </ul>
  );
}

function SortButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
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
