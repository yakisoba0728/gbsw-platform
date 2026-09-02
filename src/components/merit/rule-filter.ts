import {
  MERIT_KIND_LABELS,
  MERIT_KIND_SHORT_LABELS,
  type MeritKind,
} from "@/core/authz/merit-track";

export type RuleOption = {
  id: string;
  kind: string;
  label: string;
  points: number;
  category: string | null;
};

export function optionLabel(rule: RuleOption): string {
  const kind = MERIT_KIND_SHORT_LABELS[rule.kind as MeritKind] ?? rule.kind;
  return `[${kind} ${rule.points}점] ${rule.label}`;
}

function groupLabel(kind: string, category: string | null): string {
  const kindLabel = MERIT_KIND_LABELS[kind as MeritKind] ?? kind;
  return category ? `${kindLabel} · ${category}` : `${kindLabel} · 분류 없음`;
}

function queryTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesQuery(rule: RuleOption, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = `${rule.label} ${rule.category ?? ""}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function filterRules<T extends RuleOption>(rules: T[], query: string): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return rules;
  return rules.filter((rule) => matchesQuery(rule, tokens));
}

export type RuleGroup<T extends RuleOption = RuleOption> = {
  key: string;
  label: string;
  items: { rule: T; index: number }[];
};

export function groupRules<T extends RuleOption>(rules: T[]): RuleGroup<T>[] {
  const groups: RuleGroup<T>[] = [];

  rules.forEach((rule, index) => {
    const key = `${rule.kind}::${rule.category ?? ""}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.items.push({ rule, index });
    } else {
      groups.push({
        key,
        label: groupLabel(rule.kind, rule.category),
        items: [{ rule, index }],
      });
    }
  });

  return groups;
}
