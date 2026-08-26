"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";
import { ChevronDownIcon } from "@/components/icons";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import {
  filterRules,
  groupRules,
  optionLabel,
  type RuleOption,
} from "@/components/merit/rule-filter";

export type { RuleOption };

/**
 * 부여 항목 고르기 — 입력하면서 걸러내는 목록. 고른 id는 hidden input이 싣는다.
 * 학생 상세의 부여 폼과 반별 목록의 일괄 부여가 같은 컴포넌트를 쓴다.
 */
export function RulePicker({
  rules,
  name = "ruleId",
  onChange,
  label = "부여 항목",
}: {
  rules: RuleOption[];
  name?: string;
  /** 고른 항목이 바뀔 때. 호출부가 제출 버튼을 잠그는 데 쓴다. */
  onChange?: (rule: RuleOption | null) => void;
  label?: string;
}) {
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<RuleOption | null>(null);

  const filtered = useMemo(() => filterRules(rules, query), [rules, query]);
  const groups = useMemo(() => groupRules(filtered), [filtered]);

  // 걸러낸 결과가 짧아지면 active가 목록 밖을 가리킬 수 있다. 상태를 되돌리는
  // 대신 렌더 때 잘라 쓴다 — 여분의 리렌더가 없다.
  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));

  /**
   * 목록을 연다. 검색어를 비우고 여는 이유: 닫혀 있을 때 칸의 값은 "고른 항목"이라
   * 그대로 두면 그 글자가 검색어가 되어 자기 자신만 남는다.
   */
  function openList() {
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  function choose(rule: RuleOption) {
    setSelected(rule);
    onChange?.(rule);
    setQuery("");
    setActive(0);
    setOpen(false);
  }

  /** 방향키로 옮긴 자리가 스크롤 밖이면 끌어온다. */
  function reveal(index: number) {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // 목록을 움직이는 키다 — 막지 않으면 뒤에서 페이지가 함께 스크롤된다.
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (filtered.length === 0) return;
      const next =
        event.key === "ArrowDown"
          ? Math.min(activeIndex + 1, filtered.length - 1)
          : Math.max(activeIndex - 1, 0);
      setActive(next);
      reveal(next);
      return;
    }

    if (event.key === "Enter") {
      // 한글을 치는 중의 Enter는 낱말을 확정하는 손짓이지 고르는 손짓이 아니다.
      // 이걸 안 보면 「지각」을 확정하려던 Enter가 그 순간 강조된 규정을 골라 버린다.
      if (event.nativeEvent.isComposing) return;

      // 이 칸은 <form action={서버액션}> 안이다. 목록이 열려 있는 동안의 Enter는
      // "고른다"는 뜻이므로 막지 않으면 고르는 손짓이 그대로 부여가 된다.
      if (!open) return;
      event.preventDefault();
      const rule = filtered[activeIndex];
      if (rule) choose(rule);
      return;
    }

    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault(); // 브라우저에 따라 폼 전체를 되돌리는 키다
      setOpen(false);
      return;
    }

    if (event.key === "Tab" && open) {
      // Tab은 막지 않는다 — 고르고 나서 다음 칸(메모)으로 그대로 넘어간다.
      const rule = filtered[activeIndex];
      if (rule) choose(rule);
    }
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        // 목록 안쪽으로 옮겨 가는 포커스까지 닫아 버리면 아무것도 고를 수 없다.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <input type="hidden" name={name} value={selected?.id ?? ""} />

      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${baseId}-list`}
          aria-activedescendant={
            open && filtered[activeIndex] ? `${baseId}-opt-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-label={label}
          autoComplete="off"
          disabled={rules.length === 0}
          // 닫혀 있을 때는 고른 항목이 칸의 값이다 — 셀렉트가 그렇게 동작하고,
          // 보조기술이 읽는 것도 겹쳐 그린 그림이 아니라 이 값이다.
          value={open ? query : selected ? optionLabel(selected) : ""}
          placeholder={rules.length === 0 ? "등록된 규정이 없습니다" : "항목 고르기"}
          className="pr-9"
          style={
            !open && selected
              ? { color: "transparent", caretColor: "transparent" }
              : undefined
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={openList}
          // 포커스만으로는 부족하다. 항목을 고르고 나면 포커스가 이 칸에 남아 있어
          // (목록의 mousedown을 막아 두었다) 다시 눌러도 onFocus가 나지 않는다 —
          // 그러면 고른 뒤에는 목록이 영영 안 열린다.
          onMouseDown={() => {
            if (!open) openList();
          }}
          onKeyDown={onKeyDown}
        />

        {/* 닫혀 있고 고른 것이 있으면 종류·점수를 칸 위에 겹쳐 보인다.
            pointer-events-none이라 누르면 그대로 아래 칸이 잡힌다.
            그래서 TruncatedText를 달아도 마우스가 닿지 않는다 — 긴 항목의 전문은
            칸을 눌러 목록을 열면 잘리지 않은 채로 선다. */}
        {!open && selected && (
          <div className="pointer-events-none absolute inset-0 flex items-center gap-2 rounded-field pr-9 pl-3">
            <KindBadge kind={selected.kind} />
            <span className="min-w-0 flex-1 truncate text-caption text-ink">
              {selected.label}
            </span>
            <span
              className={`shrink-0 text-caption font-medium ${kindColorClass(selected.kind)}`}
            >
              {signedPoints(selected.kind, selected.points)}
            </span>
          </div>
        )}

        <ChevronDownIcon
          size={17}
          className={cn(
            "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-mut2 transition-transform",
            open && "rotate-180",
          )}
        />
      </div>

      {open && rules.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-[280px] overflow-y-auto rounded-field border border-line bg-surface shadow-float">
          {filtered.length === 0 ? (
            /*
              결과가 없어도 목록 자체는 그린다. 없애면 aria-controls가 없는 id를
              가리키는데 aria-expanded는 true라, 낭독기에는 「목록이 열렸다」까지만
              들리고 결과가 없다는 사실은 전달되지 않는다. role="status"로 걸러낸
              순간 읽히게 한다.
            */
            <p
              id={`${baseId}-list`}
              role="status"
              className="px-3 py-4 text-center text-xs text-mut"
            >
              맞는 항목이 없습니다.
            </p>
          ) : (
            <ul ref={listRef} id={`${baseId}-list`} role="listbox" aria-label={label}>
              {groups.map((group) => (
                <li key={group.key} role="presentation">
                  {/* 걸러낸 뒤에도 무엇들 사이에서 고르는지가 남아야 한다. */}
                  <p className="sticky top-0 border-b border-line2 bg-soft px-3 py-1.5 text-xs font-medium text-mut">
                    {group.label}
                  </p>
                  <ul role="presentation">
                    {group.items.map(({ rule, index }) => (
                      <li
                        key={rule.id}
                        id={`${baseId}-opt-${index}`}
                        data-index={index}
                        role="option"
                        aria-selected={selected?.id === rule.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(rule)}
                        className={cn(
                          "cursor-pointer px-3 py-2.5 text-caption",
                          index === activeIndex
                            ? "bg-soft font-medium text-ink"
                            : "text-ink",
                        )}
                      >
                        {optionLabel(rule)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
