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

export function RulePicker({
  rules,
  name = "ruleId",
  onChange,
  label = "부여 항목",
}: {
  rules: RuleOption[];
  name?: string;
  onChange?: (rule: RuleOption | null) => void;
  label?: string;
}) {
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [selected, setSelected] = useState<RuleOption | null>(null);

  const filtered = useMemo(() => filterRules(rules, query), [rules, query]);
  const groups = useMemo(() => groupRules(filtered), [filtered]);

  const activeIndex =
    active === null ? null : Math.min(active, Math.max(filtered.length - 1, 0));

  function openList() {
    setQuery("");
    setActive(null);
    setOpen(true);
  }

  function choose(rule: RuleOption) {
    setSelected(rule);
    onChange?.(rule);
    setQuery("");
    setActive(null);
    setOpen(false);
  }

  function reveal(index: number) {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      if (filtered.length === 0) return;
      let next: number;
      if (activeIndex === null) {
        next = event.key === "ArrowDown" ? 0 : filtered.length - 1;
      } else if (event.key === "ArrowDown") {
        next = Math.min(activeIndex + 1, filtered.length - 1);
      } else {
        next = Math.max(activeIndex - 1, 0);
      }
      setActive(next);
      reveal(next);
      return;
    }

    if (event.key === "Enter") {
      if (event.nativeEvent.isComposing) return;

      if (!open) return;
      event.preventDefault();
      const rule = activeIndex === null ? undefined : filtered[activeIndex];
      if (rule) choose(rule);
      return;
    }

    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "Tab" && open) {
      const rule = activeIndex === null ? undefined : filtered[activeIndex];
      if (rule) choose(rule);
    }
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
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
            open && activeIndex !== null && filtered[activeIndex]
              ? `${baseId}-opt-${activeIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-label={label}
          autoComplete="off"
          disabled={rules.length === 0}
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
          onMouseDown={() => {
            if (!open) openList();
          }}
          onKeyDown={onKeyDown}
        />

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
