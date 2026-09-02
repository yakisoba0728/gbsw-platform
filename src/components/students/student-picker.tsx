"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { fieldClass, Input } from "@/components/ui/input";
import { TruncatedText } from "@/components/ui/truncated-text";
import { cn } from "@/lib/cn";
import { formatSeat, formatStudentNumber } from "@/lib/student-number";
import { honorificName } from "@/core/authz/roles";

export type PickerStudent = {
  id: string;
  name: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
};

type PickerRow = { student: PickerStudent; index: number };

type PickerGroup = { key: string; label: string; rows: PickerRow[] };

export function StudentPicker({
  students,
  name,
  defaultValue,
  label = "학생 고르기",
  required = false,
}: {
  students: PickerStudent[];
  name: string;
  defaultValue?: string;
  label?: string;
  required?: boolean;
}) {
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [selectedId, setSelectedId] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const indexed = useMemo(
    () => students.map((student) => ({ student, haystack: haystackOf(student) })),
    [students],
  );
  const byId = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  );

  const groups = useMemo(() => {
    const tokens = queryTokens(query);
    if (tokens.length === 0) return groupByClass(students);
    return groupByClass(
      indexed
        .filter((entry) => tokens.every((token) => entry.haystack.includes(token)))
        .map((entry) => entry.student),
    );
  }, [students, indexed, query]);

  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0));
  const selected = byId.get(selectedId) ?? null;
  const selectedText = selected
    ? `${formatSeat(selected) ?? "미배정"} ${honorificName(selected.name, "STUDENT")}`
    : null;
  const empty = students.length === 0;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      searchRef.current?.focus();
      listRef.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: "center" });
    }
    if (!open && el.open) el.close();
  }, [open]);

  function handleOpen() {
    setQuery("");
    const ordered = groupByClass(students).flatMap((group) => group.rows);
    const index = ordered.findIndex((row) => row.student.id === selectedId);
    setActive(index < 0 ? 0 : index);
    setOpen(true);
  }

  function choose(student: PickerStudent) {
    setSelectedId(student.id);
    setOpen(false);
  }

  function reveal(index: number) {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // IME 조합 확정 Enter를 선택 입력으로 처리하지 않는다.
    if (event.nativeEvent.isComposing) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length === 0) return;
      const next =
        event.key === "ArrowDown"
          ? Math.min(activeIndex + 1, rows.length - 1)
          : Math.max(activeIndex - 1, 0);
      setActive(next);
      reveal(next);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) choose(row.student);
    }

  }

  return (
    <div className="relative">
      {required && selectedId === "" ? (
        <input
          name={name}
          required
          value=""
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden
          className="absolute bottom-0 left-0 size-px opacity-0"
          onFocus={() => triggerRef.current?.focus()}
        />
      ) : (
        <input type="hidden" name={name} value={selectedId} />
      )}

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-label={selectedText ? `${label} ${selectedText}` : undefined}
        disabled={empty}
        onClick={handleOpen}
        className={cn(
          fieldClass("md"),
          "flex items-center justify-between gap-2 text-left",
          "focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/10",
        )}
      >
        {empty ? (
          <span className="text-mut">명단에 학생이 없습니다</span>
        ) : selectedText ? (
          <TruncatedText
            full={selectedText}
            focusable={false}
            className="tabular-nums"
          >
            {selectedText}
          </TruncatedText>
        ) : (
          <span className="text-mut">{label}</span>
        )}
        <ChevronDownIcon size={17} className="shrink-0 text-mut2" />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${baseId}-title`}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        className="animate-modal-in rounded-modal border border-line bg-surface p-0 shadow-modal backdrop:bg-black/40"
      >
        <div className="flex max-h-[70dvh] w-100 max-w-full flex-col">
          <div className="shrink-0 border-b border-line p-5">
            <h2 id={`${baseId}-title`} className="text-lg font-semibold text-ink">
              {label}
            </h2>
            <Input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={`${baseId}-list`}
              aria-activedescendant={
                rows[activeIndex] ? `${baseId}-opt-${activeIndex}` : undefined
              }
              aria-autocomplete="list"
              aria-label="학생 찾기"
              autoComplete="off"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="이름 · 학번 · 1-3"
              className="mt-3"
            />
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <p
                id={`${baseId}-list`}
                role="status"
                className="px-5 py-10 text-center text-caption text-mut"
              >
                맞는 학생이 없습니다.
              </p>
            ) : (
              <ul id={`${baseId}-list`} role="listbox" aria-label="학생 목록">
                {groups.map((group) => (
                  <li key={group.key || "none"} role="presentation">
                    <p className="sticky top-0 border-b border-line2 bg-soft px-5 py-1.5 text-xs font-medium text-mut">
                      {group.label}
                    </p>
                    <ul role="presentation">
                      {group.rows.map(({ student, index }) => (
                        <li
                          key={student.id}
                          id={`${baseId}-opt-${index}`}
                          data-index={index}
                          data-active={index === activeIndex ? "true" : undefined}
                          role="option"
                          aria-selected={student.id === selectedId}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => choose(student)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 px-5 py-2.5",
                            index === activeIndex && "bg-soft",
                          )}
                        >
                          <span className="w-12 shrink-0 text-xs text-mut2 tabular-nums">
                            {formatSeat(student) ?? "미배정"}
                          </span>
                          <TruncatedText
                            full={honorificName(student.name, "STUDENT")}
                            focusable={false}
                            outerClassName="flex-1"
                            className="text-caption font-medium text-ink"
                          >
                            {honorificName(student.name, "STUDENT")}
                          </TruncatedText>
                          {student.id === selectedId && <CheckMark />}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex shrink-0 justify-end border-t border-line px-5 py-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              닫기
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function CheckMark() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-pri-ink"
      aria-hidden
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function queryTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function haystackOf(student: PickerStudent): string {
  const { grade, classNo } = student;
  const dashed = grade !== null && classNo !== null ? `${grade}-${classNo}` : "";

  return [
    student.name,
    formatStudentNumber(student) ?? "",
    formatSeat(student) ?? "",
    dashed,
  ]
    .join(" ")
    .toLowerCase();
}

function groupByClass(students: PickerStudent[]): PickerGroup[] {
  const buckets = new Map<string, PickerStudent[]>();

  for (const student of students) {
    const key =
      student.grade !== null && student.classNo !== null
        ? `${student.grade}-${student.classNo}`
        : "";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(student);
    else buckets.set(key, [student]);
  }

  let index = 0;
  return [...buckets].map(([key, items]) => ({
    key,
    label: key === "" ? "미배정" : `${items[0].grade}학년 ${items[0].classNo}반`,
    rows: items.map((student) => ({ student, index: index++ })),
  }));
}
