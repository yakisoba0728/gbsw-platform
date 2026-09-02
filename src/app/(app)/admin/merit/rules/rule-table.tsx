"use client";

import { Fragment, useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { TableFrame, tableCellPadding } from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/truncated-text";
import { DeleteRuleButton } from "@/components/merit/delete-rule-button";
import { KindBadge, kindColorClass } from "@/components/merit/kind-badge";
import { groupRules } from "@/components/merit/rule-filter";
import { ChevronDownIcon } from "@/components/icons";
import { MERIT_KIND_LABELS, meritKindSign, type MeritKind } from "@/core/authz/merit-track";
import { EMPTY_RULE_FORM_STATE } from "./action-state";
import { deleteRuleAction, updateRuleAction } from "./actions";

const HEADERS = ["종류", "분류", "항목명", "점수", "작업"] as const;

const cell = (index: number) =>
  `${tableCellPadding(index, HEADERS.length)} py-2.5`;

export type RuleRow = {
  id: string;
  kind: string;
  label: string;
  points: number;
  category: string | null;
  description: string | null;
  updatedAt: string;
};

export function RuleTable({
  rules,
  expandAllInitially = false,
}: {
  rules: RuleRow[];
  expandAllInitially?: boolean;
}) {
  const groups = groupRules(rules);
  const groupKeys = groups.map((group) => group.key);
  const groupBodyIds = groups.map((_, index) => `rule-group-${index}`);
  const [expandedGroups, setExpandedGroups] = useState(
    () => new Set(expandAllInitially ? groupKeys : groupKeys.slice(0, 1)),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealedRuleId, setRevealedRuleId] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const editButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const lastEditingId = useRef<string | null>(null);

  useEffect(() => {
    const previous = lastEditingId.current;
    lastEditingId.current = editingId;
    if (previous === editingId) return;

    if (editingId) {
      firstFieldRef.current?.focus();
      return;
    }
    if (previous) editButtonsRef.current.get(previous)?.focus();
  }, [editingId]);
  const [updateState, updateAction, updating] = useActionState(
    updateRuleAction,
    EMPTY_RULE_FORM_STATE,
  );

  const [handledUpdateState, setHandledUpdateState] = useState(updateState);
  if (updateState !== handledUpdateState) {
    setHandledUpdateState(updateState);
    if (updateState.ok) {
      setRevealedRuleId(editingId);
      setEditingId(null);
    }
  }

  if (rules.length === 0) {
    return (
      <SectionCard flush title="규정 목록" aside={<span className="text-xs text-mut">0개</span>}>
        <EmptyState variant="inside">등록된 규정이 없습니다.</EmptyState>
      </SectionCard>
    );
  }

  const isGroupExpanded = (group: (typeof groups)[number]) =>
    expandedGroups.has(group.key) ||
    group.items.some(({ rule }) => rule.id === revealedRuleId);
  const allExpanded = groups.every(isGroupExpanded);
  const noneExpanded = groups.every((group) => !isGroupExpanded(group));

  const toggleGroup = (group: (typeof groups)[number]) => {
    const expanded = isGroupExpanded(group);
    setRevealedRuleId((current) =>
      group.items.some(({ rule }) => rule.id === current) ? null : current,
    );
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (expanded) next.delete(group.key);
      else next.add(group.key);
      return next;
    });
  };

  const expandAll = () => {
    setRevealedRuleId(null);
    setExpandedGroups(new Set(groupKeys));
  };

  const collapseAll = () => {
    setRevealedRuleId(null);
    setExpandedGroups(new Set());
  };

  return (
    <SectionCard
      flush
      title="규정 목록"
      aside={
        <span className="text-xs text-mut">
          {groups.length}개 분류 · {rules.length}개
        </span>
      }
      controls={
        groups.length > 1 ? (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-controls={groupBodyIds.join(" ")}
              disabled={allExpanded}
              onClick={expandAll}
            >
              모두 펼치기
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-controls={groupBodyIds.join(" ")}
              disabled={noneExpanded}
              onClick={collapseAll}
            >
              모두 접기
            </Button>
          </div>
        ) : undefined
      }
    >
      <form id="rule-edit-form" action={updateAction} className="hidden" />

      {updateState.error && (
        <Note tone="error" className="mx-5 mt-4">
          {updateState.error}
        </Note>
      )}

      <TableFrame
        minWidth={640}
        cols={["w-[76px]", "w-[128px]", undefined, "w-[92px]", "w-[150px]"]}
        headers={HEADERS}
      >
        {groups.map((group, groupIndex) => {
          const expanded = isGroupExpanded(group);
          const bodyId = groupBodyIds[groupIndex];

          return (
            <Fragment key={group.key}>
              <tbody>
                <tr className="border-b border-line2">
                  <th scope="row" colSpan={HEADERS.length} className="p-0 text-left">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={bodyId}
                      className="flex w-full items-center gap-2 px-5 py-3 text-caption font-medium text-ink outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-ink"
                      onClick={() => toggleGroup(group)}
                    >
                      <ChevronDownIcon
                        size={16}
                        className={`shrink-0 text-mut transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                      <TruncatedText
                        full={group.label}
                        focusable={false}
                        outerClassName="min-w-0 flex-1"
                      >
                        {group.label}
                      </TruncatedText>
                      <span className="shrink-0 text-xs font-normal text-mut">
                        {group.items.length}개
                      </span>
                    </button>
                  </th>
                </tr>
              </tbody>

              <tbody id={bodyId} hidden={!expanded}>
                {group.items.map(({ rule }) => {
                  const editing = editingId === rule.id;
                  const typed =
                    updateState.values?.ruleId === rule.id ? updateState.values : null;

                  return (
                    <tr key={rule.id} className="border-b border-line2 last:border-0">
                      <td className={cell(0)}>
                        <KindBadge kind={rule.kind} />
                      </td>

                      <td className={`${cell(1)} text-mut`}>
                        {editing ? (
                          <Input
                            ref={firstFieldRef}
                            size="sm"
                            name="category"
                            form="rule-edit-form"
                            defaultValue={typed?.category ?? rule.category ?? ""}
                            maxLength={50}
                            aria-label={`${rule.label} 분류 수정`}
                          />
                        ) : (
                          (rule.category ?? "—")
                        )}
                      </td>

                      <td className={`${cell(2)} font-medium text-ink`}>
                        {editing ? (
                          <Input
                            size="sm"
                            name="label"
                            form="rule-edit-form"
                            defaultValue={typed?.label ?? rule.label}
                            required
                            maxLength={200}
                            aria-label={`${rule.label} 항목명 수정`}
                          />
                        ) : (
                          rule.label
                        )}
                      </td>

                      <td className={`${cell(3)} font-medium text-ink`}>
                        <span className="flex items-center gap-1">
                          <span aria-hidden className={kindColorClass(rule.kind)}>
                            {meritKindSign(rule.kind)}
                          </span>
                          {editing ? (
                            <span className="inline-block w-16">
                              <Input
                                size="sm"
                                name="points"
                                form="rule-edit-form"
                                defaultValue={typed?.points ?? String(rule.points)}
                                inputMode="numeric"
                                required
                                aria-label={`${rule.label} 점수 수정 (${
                                  MERIT_KIND_LABELS[rule.kind as MeritKind]
                                })`}
                              />
                            </span>
                          ) : (
                            rule.points
                          )}
                        </span>
                      </td>

                      <td className={cell(4)}>
                        {editing ? (
                          <div className="flex gap-2">
                            <input type="hidden" name="ruleId" value={rule.id} form="rule-edit-form" />
                            <input
                              type="hidden"
                              name="updatedAt"
                              value={rule.updatedAt}
                              form="rule-edit-form"
                            />
                            <input
                              type="hidden"
                              name="description"
                              value={rule.description ?? ""}
                              form="rule-edit-form"
                            />
                            <ConfirmSubmit
                              label="저장"
                              ariaLabel={`${rule.label} 규정 저장`}
                              title="규정 수정"
                              description="이미 부여된 점수는 그대로 두고 앞으로의 부여에만 적용됩니다."
                              confirmLabel="저장"
                              pendingLabel="저장 중…"
                              pending={updating}
                              variant="secondary"
                              size="sm"
                              full={false}
                              form="rule-edit-form"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              aria-label={`${rule.label} 규정 수정 취소`}
                              onClick={() => setEditingId(null)}
                            >
                              취소
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              ref={(node) => {
                                const map = editButtonsRef.current;
                                if (node) map.set(rule.id, node);
                                else map.delete(rule.id);
                              }}
                              type="button"
                              variant="secondary"
                              size="sm"
                              aria-label={`${rule.label} 규정 수정`}
                              onClick={() => {
                                setRevealedRuleId(null);
                                setEditingId(rule.id);
                              }}
                            >
                              수정
                            </Button>
                            <DeleteRuleButton
                              ruleId={rule.id}
                              updatedAt={rule.updatedAt}
                              label={rule.label}
                              deleteAction={deleteRuleAction}
                              initialState={EMPTY_RULE_FORM_STATE}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Fragment>
          );
        })}
      </TableFrame>
    </SectionCard>
  );
}
