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

/** 고를 수 있는 학생 한 명. 명단이 가진 것을 그대로 받는다. */
export type PickerStudent = {
  /** StudentProfile.id */
  id: string;
  name: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
};

/** 목록에 선 한 줄. `index`는 목록 전체에서의 자리로, 방향키가 이 번호로 움직인다. */
type PickerRow = { student: PickerStudent; index: number };

type PickerGroup = { key: string; label: string; rows: PickerRow[] };

/**
 * 학생 한 명을 고르는 모달. 폼에는 hidden input으로 id가 실린다.
 *
 * 300명을 `<select>` 한 줄에 늘어놓으면 고를 수 없고, 검색칸과 목록을 폼 안에
 * 나란히 두면 폼이 검색칸에 밀려 길어진다 — 고르는 일만 모달로 떼어 낸다.
 *
 * 네이티브 `<dialog>` + `showModal()`을 쓴다 (confirm-dialog와 같다) — 포커스
 * 가두기·Esc 닫기·뒤쪽 비활성화를 공짜로 준다. 가운데 정렬은 globals.css의
 * `dialog:modal { margin: auto }`가 맡는다.
 *
 * **고른 값은 리액트 상태다.** DOM의 `defaultSelected`가 아니므로 액션이 끝난 뒤의
 * 폼 자동 리셋이 건드리지 못한다 — 실패해서 다시 그려져도 고른 학생이 그대로 남는다.
 * 반대로 성공한 뒤 비우려면 호출부가 `key`로 새로 마운트해야 한다.
 */
export function StudentPicker({
  students,
  name,
  defaultValue,
  label = "학생 고르기",
  required = false,
}: {
  students: PickerStudent[];
  /** hidden input의 name. 자리마다 다르다 (studentId / studentProfileId …) */
  name: string;
  /** 되돌릴 선택값 (폼이 실패해 다시 그려질 때) */
  defaultValue?: string;
  /** 비면 「학생 고르기」 */
  label?: string;
  required?: boolean;
}) {
  // 한 화면에 여러 개가 설 수 있다. 고정 id를 쓰면 두 번째부터 제목·목록의
  // 연결이 첫 번째를 가리킨다.
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [selectedId, setSelectedId] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  // 검색용 문자열은 명단이 바뀔 때만 만든다. 글자마다 300명을 다시 조립하면
  // 타이핑이 밀린다 — 이제 글자마다 하는 일은 includes 몇 번뿐이다.
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

  // 방향키가 훑는 차례. 화면에 선 순서와 같아야 해서 묶음을 펼쳐 만든다.
  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

  // 걸러낸 결과가 짧아지면 active가 목록 밖을 가리킬 수 있다. 상태를 되돌리는
  // 대신 렌더 때 잘라 쓴다 — 여분의 리렌더가 없다.
  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0));
  // 명단에 없는 id(지난 학년도의 값 등)를 되돌려 받으면 이름을 못 붙인다. 값은
  // 그대로 실어 보내고 버튼만 「고르기」로 떨어진다 — 값을 지우면 되돌린 것이 사라진다.
  const selected = byId.get(selectedId) ?? null;
  const selectedText = selected
    ? `${formatSeat(selected) ?? "미배정"} ${selected.name}`
    : null;
  const empty = students.length === 0;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // autoFocus는 못 쓴다 — React는 마운트 때 적용하는데 이 dialog는 닫힌 채 뜬다.
      searchRef.current?.focus();
      // 이미 고른 학생이 목록 아래쪽에 있으면 열자마자 보이지 않는다.
      listRef.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: "center" });
    }
    if (!open && el.open) el.close();
  }, [open]);

  function handleOpen() {
    // 검색어를 비우고 연다 — 지난번에 치던 글자가 남아 있으면 목록이 이미 좁혀진
    // 채로 열려서 "왜 이 학생만 있지"가 된다.
    setQuery("");
    // 비운 검색어로 설 순서에서 고른 학생이 어디인지 찾는다. 방향키가 거기서 출발한다.
    const ordered = groupByClass(students).flatMap((group) => group.rows);
    const index = ordered.findIndex((row) => row.student.id === selectedId);
    setActive(index < 0 ? 0 : index);
    setOpen(true);
  }

  function choose(student: PickerStudent) {
    setSelectedId(student.id);
    // 포커스는 브라우저가 여는 버튼으로 되돌린다 (showModal이 기억한다).
    setOpen(false);
  }

  /** 방향키로 옮긴 자리가 스크롤 밖이면 끌어온다. */
  function reveal(index: number) {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // 한글을 조합하는 중의 키는 IME의 것이다 — 가로채면 「김민준」을 다 치기도 전에
    // 확정하려던 Enter가 목록을 골라 버린다. 이 Enter는 IME가 먹으므로 바깥 폼의
    // 제출로도 새지 않는다.
    if (event.nativeEvent.isComposing) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // 목록을 움직이는 키다 — 막지 않으면 뒤에서 페이지가 함께 스크롤된다.
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
      // 모달은 화면에서만 맨 위로 올라가고 DOM에서는 바깥 `<form>` 안에 그대로
      // 있다. 막지 않으면 고르려던 Enter가 그 폼의 제출이 된다 — 결과가 없어
      // 고를 것이 없을 때도 마찬가지다.
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) choose(row.student);
    }

    // Escape는 가로채지 않는다 — `<dialog>`가 받아 닫고 onClose가 상태를 되맞춘다.
  }

  return (
    <div className="relative">
      {required && selectedId === "" ? (
        /*
         * 브라우저 검증을 살리는 칸. `type="hidden"`은 검증에서 빠지고 `<button>`은
         * 값을 갖지 않아, 화면에 안 보이지만 포커스는 되는 1px 칸이 대신 선다
         * (`display:none`이면 브라우저가 "포커스할 수 없다"며 제출을 조용히 막는다).
         * 여는 버튼 왼쪽 아래에 두어 안내 풍선이 엉뚱한 곳을 가리키지 않게 한다.
         */
        <input
          name={name}
          required
          value=""
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden
          className="absolute bottom-0 left-0 size-px opacity-0"
          // 검증이 여기로 옮긴 포커스를 고르는 버튼으로 넘긴다.
          onFocus={() => triggerRef.current?.focus()}
        />
      ) : (
        <input type="hidden" name={name} value={selectedId} />
      )}

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        // 고르고 나면 버튼 글자가 학생 이름이라 무엇을 고르는 자리인지가 사라진다.
        // 보이는 글자를 그대로 품은 이름을 준다 (WCAG 2.5.3).
        aria-label={selectedText ? `${label} ${selectedText}` : undefined}
        disabled={empty}
        onClick={handleOpen}
        className={cn(
          fieldClass("md"),
          "flex items-center justify-between gap-2 text-left",
          // fieldClass의 outline-none을 그대로 두고, 포커스 표시는 입력칸과 같은
          // 모양으로 그린다 (globals.css의 input:focus-visible과 같은 값).
          "focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/10",
        )}
      >
        {empty ? (
          <span className="text-mut">명단에 학생이 없습니다</span>
        ) : selectedText ? (
          <TruncatedText
            full={selectedText}
            // 버튼 안이다. 초점을 두면 버튼과 그 안이 탭에서 두 번 멈춘다 —
            // 전문은 버튼의 aria-label이 이미 읽어 준다.
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
        // Esc로 닫히면 브라우저가 close를 준다. 상태를 되맞추지 않으면 다음에 안 열린다.
        onClose={() => setOpen(false)}
        // 배경을 눌러도 닫는다 — 지울 것이 검색어뿐이라 되돌릴 입력이 없다.
        // 안쪽(검색칸·목록)을 누른 것과 가르려면 대상을 봐야 한다.
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
              /*
                결과가 없어도 목록의 id는 남긴다. 없애면 aria-controls가 없는 id를
                가리키는데, 낭독기에는 「목록이 열렸다」까지만 들리고 결과가 없다는
                사실은 전달되지 않는다. role="status"로 걸러낸 순간 읽히게 한다.
              */
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
                    {/* 걸러낸 뒤에도 무엇들 사이에서 고르는지가 남아야 한다. */}
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
                            full={student.name}
                            // 초점은 검색칸에 머문다(aria-activedescendant) — 목록에
                            // 초점을 두면 탭이 검색칸과 닫기 사이에서 멈춘다.
                            focusable={false}
                            outerClassName="flex-1"
                            className="text-caption font-medium text-ink"
                          >
                            {student.name}
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

/** 고른 줄 표시. 색만으로 말하지 않으려고 형태를 함께 둔다. */
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

/**
 * 검색어를 낱말로 쪼갠다. 낱말이 전부 들어맞아야 통과한다 — 문자열 그대로
 * 비교하면 "1-3 민준"이 아무것도 못 찾는다.
 */
function queryTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * 한 학생을 찾아낼 수 있는 모든 표기를 한 줄에 모은다 — 이름(`김민준`)·
 * 학번(`1307`)·자리(`2-30 5`)·학년반(`1-3`). 학번으로 외우는 교사와 반으로
 * 찾는 교사가 나뉘고, 반이 두 자리면 학번 자체가 없다.
 */
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

/**
 * 학년·반으로 묶는다. 순서는 명단이 준 그대로다 — 다시 정렬하면 서비스가 세운
 * 순서(학년·반·번호)와 어긋난다. 같은 반이 떨어져 있어도 한 묶음으로 모으므로
 * 명단이 정렬돼 있지 않아도 반이 두 번 나오지 않는다.
 */
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
