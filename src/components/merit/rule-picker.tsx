"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";
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

  function choose(rule: RuleOption) {
    setSelected(rule);
    onChange?.(rule);
    setQuery("");
    setActive(0);
    setOpen(false);
  }

  function clear() {
    setSelected(null);
    onChange?.(null);
    setQuery("");
    setActive(0);
    setOpen(true);
    inputRef.current?.focus();
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
        aria-label={`${label} 검색`}
        autoComplete="off"
        disabled={rules.length === 0}
        value={query}
        placeholder={selected ? "다른 항목 검색" : "항목 검색 — 이름 또는 분류"}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {/* 고른 뒤에도 종류·점수·항목명이 남아야 한다 — 다음에 누르는 것이 "부여"다. */}
      {selected ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-btn border border-line bg-soft px-3 py-2">
          <KindBadge kind={selected.kind} />
          <span className="min-w-0 flex-1 text-caption font-medium text-ink">
            {selected.label}
          </span>
          <span className={`text-caption font-medium ${kindColorClass(selected.kind)}`}>
            {signedPoints(selected.kind, selected.points)}
          </span>
          <button
            type="button"
            onClick={clear}
            className="rounded-btn border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            변경
          </button>
        </div>
      ) : (
        rules.length > 0 && (
          <p className="mt-1.5 text-xs text-mut">항목을 골라야 부여할 수 있습니다.</p>
        )
      )}

      {open && rules.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-[280px] overflow-y-auto rounded-field border border-line bg-surface shadow-float">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-mut">
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
