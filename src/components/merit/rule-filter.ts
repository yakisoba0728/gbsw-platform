import {
  MERIT_KIND_LABELS,
  MERIT_KIND_SHORT_LABELS,
  type MeritKind,
} from "@/core/authz/merit-track";

/**
 * 부여 항목 선택지의 순수 부분 — 검색과 묶기. 화면에서 떼어 둔 이유는 테스트가
 * node 환경이라서다: 걸러내는 규칙이 컴포넌트 안에 있으면 검증할 방법이 없다.
 */

export type RuleOption = {
  id: string;
  kind: string;
  label: string;
  points: number;
  category: string | null;
};

/** `[상 5점] 교내 봉사활동 우수 참여` 꼴. */
export function optionLabel(rule: RuleOption): string {
  const kind = MERIT_KIND_SHORT_LABELS[rule.kind as MeritKind] ?? rule.kind;
  return `[${kind} ${rule.points}점] ${rule.label}`;
}

/** 분류 머리글에 종류를 함께 적는다 — 상점·벌점에 같은 분류명이 나올 수 있다. */
function groupLabel(kind: string, category: string | null): string {
  const kindLabel = MERIT_KIND_LABELS[kind as MeritKind] ?? kind;
  return category ? `${kindLabel} · ${category}` : `${kindLabel} · 분류 없음`;
}

/**
 * 검색어를 낱말로 쪼갠다. 낱말이 전부 들어맞아야 통과한다 — 문자열 그대로
 * 비교하면 "점호 지각"으로 "인원 점검 시 지각"이 안 걸린다.
 */
function queryTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** 항목명과 분류를 함께 본다 — 항목명으로 찾는 사람과 분류로 찾는 사람이 나뉜다. */
function matchesQuery(rule: RuleOption, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = `${rule.label} ${rule.category ?? ""}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

/** 제네릭이다 — 규정 관리 화면의 행(필드가 더 붙어 있다)도 그대로 거른다. */
export function filterRules<T extends RuleOption>(rules: T[], query: string): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return rules;
  return rules.filter((rule) => matchesQuery(rule, tokens));
}

export type RuleGroup<T extends RuleOption = RuleOption> = {
  key: string;
  label: string;
  /** 목록 전체에서의 자리. 방향키가 이 번호로 움직인다. */
  items: { rule: T; index: number }[];
};

/**
 * 종류·분류가 같은 연속된 규정을 한 묶음으로 접는다. 다시 정렬하지 않는다 —
 * 서비스가 세운 순서(학교 규정표의 순서)와 어긋난다.
 */
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
