"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { TableFrame, tableCellPadding } from "@/components/ui/table";
import { KindBadge, kindColorClass } from "@/components/merit/kind-badge";
import { MERIT_KIND_LABELS, meritKindSign, type MeritKind } from "@/core/authz/merit-track";
import { EMPTY_RULE_FORM_STATE } from "./action-state";
import { deleteRuleAction, updateRuleAction } from "./actions";

const HEADERS = ["종류", "분류", "항목명", "점수", "작업"] as const;

/** 본문 셀의 좌우 여백. 머리글과 같은 규칙을 써야 세로줄이 맞는다. */
const cell = (index: number) =>
  `${tableCellPadding(index, HEADERS.length)} py-2.5`;

export type RuleRow = {
  id: string;
  kind: string;
  label: string;
  points: number;
  category: string | null;
  description: string | null;
  active: boolean;
};

/**
 * 규정 목록. `<tr>` 안에는 `<form>`을 둘 수 없어(foster parenting) 폼을 표 바깥에
 * 숨겨 두고 편집 중인 행의 입력만 `form` 속성으로 잇는다. 한 번에 한 줄만 편집한다.
 */
export function RuleTable({ rules }: { rules: RuleRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updateState, updateAction, updating] = useActionState(
    updateRuleAction,
    EMPTY_RULE_FORM_STATE,
  );
  const [deleteState, deleteAction] = useActionState(
    deleteRuleAction,
    EMPTY_RULE_FORM_STATE,
  );

  // 성공하면 편집 모드를 닫고, 실패하면 값을 남겨 다시 고칠 수 있게 한다.
  // 렌더 중 비교로 처리한다 — effect 안의 setState는 리렌더를 한 번 더 만든다.
  const [handledUpdateState, setHandledUpdateState] = useState(updateState);
  if (updateState !== handledUpdateState) {
    setHandledUpdateState(updateState);
    if (updateState.ok) setEditingId(null);
  }

  if (rules.length === 0) {
    return <EmptyState>등록된 규정이 없습니다.</EmptyState>;
  }

  return (
    <section className="rounded-card border border-line bg-surface">
      <form id="rule-edit-form" action={updateAction} className="hidden" />
      <form id="rule-delete-form" action={deleteAction} className="hidden" />

      {(updateState.error ?? deleteState.error) && (
        <Note tone="error" className="mx-5 mt-4">
          {updateState.error ?? deleteState.error}
        </Note>
      )}

      <TableFrame
        minWidth={640}
        cols={["w-[76px]", "w-[128px]", undefined, "w-[92px]", "w-[150px]"]}
        headers={HEADERS}
      >
        <tbody>
          {rules.map((rule) => {
            const editing = editingId === rule.id;

            return (
              <tr key={rule.id} className="border-b border-line2 last:border-0">
                <td className={cell(0)}>
                  <KindBadge kind={rule.kind} />
                </td>

                <td className={`${cell(1)} text-mut`}>
                  {editing ? (
                    <Input
                      dense
                      name="category"
                      form="rule-edit-form"
                      defaultValue={rule.category ?? ""}
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
                      dense
                      name="label"
                      form="rule-edit-form"
                      defaultValue={rule.label}
                      required
                      maxLength={200}
                      aria-label={`${rule.label} 항목명 수정`}
                    />
                  ) : (
                    rule.label
                  )}
                </td>

                {/* 부호는 종류가 정하며 고칠 수 없다. 수정 중에도 입력칸 앞에 붙여 둔다. */}
                <td className={`${cell(3)} font-medium text-ink`}>
                  <span className="flex items-center gap-1">
                    <span aria-hidden className={kindColorClass(rule.kind)}>
                      {meritKindSign(rule.kind)}
                    </span>
                    {editing ? (
                      // 폭은 바깥에서 준다 — cn()은 tailwind-merge가 아니라
                      // Input의 w-full을 className으로 덮을 수 없다.
                      <span className="inline-block w-16">
                        <Input
                          dense
                          name="points"
                          form="rule-edit-form"
                          defaultValue={String(rule.points)}
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
                      {/* 표에 없는 필드는 그대로 넘긴다 — 안 넘기면 수정할 때마다 설명이 사라진다. */}
                      <input
                        type="hidden"
                        name="description"
                        value={rule.description ?? ""}
                        form="rule-edit-form"
                      />
                      <Button type="submit" form="rule-edit-form" size="sm" disabled={updating}>
                        {updating ? "저장 중…" : "저장"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        취소
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingId(rule.id)}
                      >
                        수정
                      </Button>
                      <Button
                        type="submit"
                        form="rule-delete-form"
                        name="ruleId"
                        value={rule.id}
                        variant="danger"
                        size="sm"
                        onClick={(e) => {
                          if (
                            !confirm(
                              `"${rule.label}" 규정을 삭제합니다.\n\n` +
                                `· 목록과 부여 화면에서 사라집니다\n` +
                                `· 되돌릴 수 없습니다\n` +
                                `· 이미 부여한 기록은 그대로 남습니다`,
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        삭제
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableFrame>
    </section>
  );
}
