"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MERIT_KIND_LABELS, type MeritKind } from "@/core/authz/merit-track";
import { EMPTY_RULE_FORM_STATE } from "./action-state";
import { deactivateRuleAction, updateRuleAction } from "./actions";

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
 * 규정 목록. "수정"을 누르면 그 줄이 입력 가능한 상태로 바뀐다.
 *
 * `<tr>` 안에 `<form>`을 둘 수 없다 — HTML 파서가 폼을 테이블 밖으로 밀어내
 * 구조가 깨진다(foster parenting). 그래서 실제 `<form>`은 표 바깥에 숨겨 두고,
 * 편집 중인 행의 입력만 `form` 속성으로 그 폼에 연결한다. 한 번에 한 줄만
 * 편집 상태이므로 이름 충돌이 없다 — 편집 중이 아닌 행은 입력을 아예 그리지 않는다.
 */
export function RuleTable({ rules }: { rules: RuleRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updateState, updateAction, updating] = useActionState(
    updateRuleAction,
    EMPTY_RULE_FORM_STATE,
  );
  const [deactivateState, deactivateAction] = useActionState(
    deactivateRuleAction,
    EMPTY_RULE_FORM_STATE,
  );

  // 수정이 성공하면 편집 모드를 닫는다. 실패하면 값을 그대로 두어 다시 고칠 수 있게 한다.
  // useEffect 대신 렌더 중 이전 상태와 비교해 처리한다 — effect 안에서 곧바로
  // setState하면 리렌더가 한 번 더 발생한다(react-hooks/set-state-in-effect가
  // 지적하는 지점). React 문서가 권장하는 "렌더 중 상태 조정" 패턴을 쓴다.
  const [handledUpdateState, setHandledUpdateState] = useState(updateState);
  if (updateState !== handledUpdateState) {
    setHandledUpdateState(updateState);
    if (updateState.ok) setEditingId(null);
  }

  if (rules.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center text-[12.5px] text-mut">
        등록된 규정이 없습니다.
      </div>
    );
  }

  return (
    <section className="rounded-card border border-line bg-surface">
      <form id="rule-edit-form" action={updateAction} className="hidden" />
      <form id="rule-deactivate-form" action={deactivateAction} className="hidden" />

      {(updateState.error ?? deactivateState.error) && (
        <p
          role="alert"
          className="mx-5 mt-4 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose"
        >
          {updateState.error ?? deactivateState.error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <colgroup>
            <col className="w-[76px]" />
            <col />
            <col className="w-[90px]" />
            <col className="w-[120px]" />
            <col className="w-[72px]" />
            <col className="w-[150px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line2 text-[12px] text-mut">
              <th className="px-5 py-2.5 font-semibold">종류</th>
              <th className="px-3 py-2.5 font-semibold">항목명</th>
              <th className="px-3 py-2.5 font-semibold">점수</th>
              <th className="px-3 py-2.5 font-semibold">분류</th>
              <th className="px-3 py-2.5 font-semibold">상태</th>
              <th className="px-5 py-2.5 font-semibold">작업</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => {
              const editing = editingId === rule.id;
              const dim = rule.active ? "text-ink" : "text-mut line-through";

              return (
                <tr key={rule.id} className="border-b border-line2 last:border-0">
                  <td className="px-5 py-2.5">
                    <Badge tone={rule.kind === "MERIT" ? "merit" : "demerit"}>
                      {MERIT_KIND_LABELS[rule.kind as MeritKind]}
                    </Badge>
                  </td>

                  <td className={`px-3 py-2.5 font-semibold ${dim}`}>
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

                  {/*
                    부호는 종류가 정하며 고칠 수 없다. 수정 중에도 입력칸 앞에
                    그대로 붙여 둔다 — 예전엔 편집을 시작하면 부호가 사라져서
                    상점을 고치는지 벌점을 고치는지 화면에서 알 수 없었다.
                  */}
                  <td className={`px-3 py-2.5 font-bold ${dim}`}>
                    <span className="flex items-center gap-1">
                      <span
                        aria-hidden
                        className={
                          rule.kind === "MERIT" ? "text-blue" : "text-rose"
                        }
                      >
                        {rule.kind === "MERIT" ? "+" : "−"}
                      </span>
                      {editing ? (
                        <Input
                          dense
                          name="points"
                          form="rule-edit-form"
                          defaultValue={String(rule.points)}
                          inputMode="numeric"
                          required
                          className="w-16"
                          aria-label={`${rule.label} 점수 수정 (${
                            MERIT_KIND_LABELS[rule.kind as MeritKind]
                          })`}
                        />
                      ) : (
                        rule.points
                      )}
                    </span>
                  </td>

                  <td className={`px-3 py-2.5 ${rule.active ? "text-mut" : "text-mut line-through"}`}>
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

                  <td className="px-3 py-2.5">
                    <Badge tone={rule.active ? "approved" : "cancelled"}>
                      {rule.active ? "사용" : "중지"}
                    </Badge>
                  </td>

                  <td className="px-5 py-2.5">
                    {!rule.active ? null : editing ? (
                      <div className="flex gap-2">
                        <input type="hidden" name="ruleId" value={rule.id} form="rule-edit-form" />
                        {/* 표에 없는 필드(설명)는 그대로 넘긴다 — 안 넘기면 zod가
                            빈 값으로 받아 매번 수정할 때마다 설명이 사라진다. */}
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
                          form="rule-deactivate-form"
                          name="ruleId"
                          value={rule.id}
                          variant="danger"
                          size="sm"
                          onClick={(e) => {
                            if (
                              !confirm(
                                `"${rule.label}" 규정을 비활성합니다. 이미 준 기록에는 영향이 없습니다.`,
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                        >
                          비활성
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
