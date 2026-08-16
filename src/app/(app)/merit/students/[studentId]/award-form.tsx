"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EMPTY_MERIT_STATE } from "@/app/(app)/merit/action-state";
import { awardAction } from "@/app/(app)/merit/actions";

type RuleOption = {
  id: string;
  kind: string;
  label: string;
  points: number;
  category: string | null;
};

const optionLabel = (rule: { kind: string; points: number; label: string }) =>
  `[${rule.kind === "MERIT" ? "상" : "벌"} ${rule.points}점] ${rule.label}`;

/** 시안의 "상벌점 부여" 카드. 항목(select) · 메모(선택) · 부여 버튼. */
export function AwardForm({
  studentProfileId,
  rules,
}: {
  studentProfileId: string;
  rules: RuleOption[];
}) {
  const [state, formAction, pending] = useActionState(awardAction, EMPTY_MERIT_STATE);

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="mb-3.5 text-[13px] font-bold text-ink">상벌점 부여</h2>

      <form action={formAction} className="flex flex-wrap items-end gap-2.5">
        <input type="hidden" name="studentProfileId" value={studentProfileId} />

        <div className="min-w-[220px] flex-[2]">
          <Select name="ruleId" required defaultValue="" aria-label="항목">
            <option value="" disabled>
              항목 선택
            </option>
            {rules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {optionLabel(rule)}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-[160px] flex-[2]">
          <Input name="note" placeholder="메모 (선택)" aria-label="메모" />
        </div>

        <Button type="submit" disabled={pending || rules.length === 0}>
          {pending ? "부여하는 중…" : "부여"}
        </Button>
      </form>

      {rules.length === 0 && (
        <p className="mt-3 text-[12.5px] text-mut">
          이 트랙에 등록된 규정이 없습니다. 규정 관리에서 먼저 추가해 주세요.
        </p>
      )}

      {state.error && (
        <p
          role="alert"
          className="mt-3 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose"
        >
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="mt-3 rounded-btn bg-green-soft px-3 py-2.5 text-[13px] font-semibold text-green">
          부여했습니다.
        </p>
      )}
    </section>
  );
}
