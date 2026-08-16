import { MERIT_KIND_LABELS, type MeritKind } from "@/core/authz/merit-track";

export type RuleOption = {
  id: string;
  kind: string;
  label: string;
  points: number;
  category: string | null;
};

/** 시안의 표기 그대로 — `[상 5점] 교내 봉사활동 우수 참여`. */
function optionLabel(rule: RuleOption): string {
  const kind = rule.kind === "MERIT" ? "상" : "벌";
  return `[${kind} ${rule.points}점] ${rule.label}`;
}

/** 분류 머리글에 종류를 함께 적는다 — 상점·벌점에 같은 분류명이 나올 수 있다. */
function groupLabel(kind: string, category: string | null): string {
  const kindLabel = MERIT_KIND_LABELS[kind as MeritKind] ?? kind;
  return category ? `${kindLabel} · ${category}` : `${kindLabel} · 분류 없음`;
}

/**
 * 부여 항목 선택지. **분류별로 묶어서 낸다.**
 *
 * 교내 규정만 73개라 평평한 목록에서는 원하는 항목을 찾을 수 없다. 서비스가
 * 이미 종류 → 분류 → 점수 순으로 정렬해 주므로, 여기서는 연속된 같은
 * (종류, 분류)를 optgroup으로 묶기만 한다 — 다시 정렬하지 않는다.
 *
 * 학생 상세의 부여 폼과 반별 목록의 일괄 부여가 함께 쓴다.
 */
export function RuleOptions({ rules }: { rules: RuleOption[] }) {
  const groups: { key: string; label: string; rules: RuleOption[] }[] = [];

  for (const rule of rules) {
    const key = `${rule.kind}::${rule.category ?? ""}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.rules.push(rule);
    } else {
      groups.push({ key, label: groupLabel(rule.kind, rule.category), rules: [rule] });
    }
  }

  return (
    <>
      {groups.map((group) => (
        <optgroup key={group.key} label={group.label}>
          {group.rules.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {optionLabel(rule)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
