"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { TableFrame, tableCellPadding } from "@/components/ui/table";
import { DeleteRuleButton } from "@/components/merit/delete-rule-button";
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
  updatedAt: string;
};

/**
 * 규정 목록. `<tr>` 안에는 `<form>`을 둘 수 없어(foster parenting) 폼을 표 바깥에
 * 숨겨 두고 편집 중인 행의 입력만 `form` 속성으로 잇는다. 한 번에 한 줄만 편집한다.
 *
 * `form` 속성으로 이어진 입력도 그 폼의 소유라, React 19가 액션 뒤에 부르는
 * reset()이 함께 되돌린다. 저장에 실패하면 편집 모드는 남고 값만 규정 원본으로
 * 돌아가므로, 실패 상태가 실어 온 제출값을 defaultValue로 다시 내려 준다.
 */
export function RuleTable({ rules }: { rules: RuleRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  /**
   * 편집을 켜고 끌 때 초점을 옮긴다.
   *
   * 켜고 끄는 두 모양이 같은 자리에 **다른 태그**를 그린다(「수정」 버튼 ↔ 숨은
   * input). React가 그 자리를 언마운트하므로, 방금 누른 버튼이 사라지면서 초점이
   * `<body>`로 떨어진다 — 키보드로 「수정」을 누른 사람은 페이지 맨 위에서 Tab을
   * 다시 밟아야 방금 연 입력칸에 닿는다.
   */
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
    // 편집에서 나오면 그 줄의 「수정」으로 돌려보낸다 — 눌렀던 자리다.
    if (previous) editButtonsRef.current.get(previous)?.focus();
  }, [editingId]);
  const [updateState, updateAction, updating] = useActionState(
    updateRuleAction,
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
    // 비어도 카드 제목을 남긴다 — 제목까지 사라지면 무엇이 없는 것인지 모른다.
    return (
      <SectionCard flush title="규정 목록" aside={<span className="text-xs text-mut">0개</span>}>
        <EmptyState variant="inside">등록된 규정이 없습니다.</EmptyState>
      </SectionCard>
    );
  }

  return (
    <SectionCard flush title="규정 목록" aside={<span className="text-xs text-mut">{rules.length}개</span>}>
      <form id="rule-edit-form" action={updateAction} className="hidden" />

      {/* 삭제 실패는 각 행의 모달이 자기 안에서 보여준다. */}
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
        <tbody>
          {rules.map((rule) => {
            const editing = editingId === rule.id;
            // 방금 저장에 실패한 그 행일 때만 제출값을 쓴다 — ruleId로 가르지 않으면
            // 다른 행을 열었을 때 남의 값이 채워진다.
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
                      {/* 표에 없는 필드는 그대로 넘긴다 — 안 넘기면 수정할 때마다 설명이 사라진다. */}
                      <input
                        type="hidden"
                        name="description"
                        value={rule.description ?? ""}
                        form="rule-edit-form"
                      />
                      {/* 이 화면을 연 목적은 규정 추가다 — 인라인 편집의 저장은 취소와 짝이다. */}
                      <Button
                        type="submit"
                        form="rule-edit-form"
                        variant="secondary"
                        size="sm"
                        disabled={updating}
                      >
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
                        ref={(node) => {
                          const map = editButtonsRef.current;
                          if (node) map.set(rule.id, node);
                          else map.delete(rule.id);
                        }}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingId(rule.id)}
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
      </TableFrame>
    </SectionCard>
  );
}
