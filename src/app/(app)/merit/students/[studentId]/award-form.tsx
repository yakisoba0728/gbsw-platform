"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { RulePicker, type RuleOption } from "@/components/merit/rule-picker";
import { EMPTY_MERIT_STATE } from "@/app/(app)/merit/action-state";
import { awardAction } from "@/app/(app)/merit/actions";

/** 상벌점 부여 카드. 항목 고르기 · 발생일 · 메모(선택) · 부여 버튼. */
export function AwardForm({
  studentProfileId,
  rules,
  today,
}: {
  studentProfileId: string;
  rules: RuleOption[];
  /** 오늘 날짜(KST, `YYYY-MM-DD`). 서버가 계산해 내려준다. */
  today: string;
}) {
  const fieldId = useId();
  const [state, formAction, pending] = useActionState(awardAction, EMPTY_MERIT_STATE);
  // 고른 항목은 hidden input이 싣고 가지만, 제출 버튼을 잠그려면 화면도 알아야 한다.
  const [rule, setRule] = useState<RuleOption | null>(null);

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="mb-3.5 text-lg font-semibold text-ink">상벌점 부여</h2>

      {/* 항목 고르기는 한 줄을 통째로 쓴다 — 검색 목록이 아래로 펼쳐진다. */}
      <form action={formAction} className="space-y-2.5">
        <input type="hidden" name="studentProfileId" value={studentProfileId} />

        <RulePicker rules={rules} onChange={setRule} />

        <div className="flex flex-wrap items-end gap-2.5">
          {/* 발생일은 고칠 수 있어야 한다 — 금요일 일을 월요일에 넣는다.
              max로 미래를 막고, 학년도 창 검사는 서버가 한다. */}
          <div className="w-[150px]">
            <Label htmlFor={`${fieldId}-occurred`}>발생일</Label>
            <Input
              id={`${fieldId}-occurred`}
              type="date"
              name="occurredOn"
              defaultValue={today}
              max={today}
              required
            />
          </div>

          <div className="min-w-[160px] flex-1">
            <Input name="note" placeholder="메모 (선택)" aria-label="메모" />
          </div>

          <Button type="submit" disabled={pending || rules.length === 0 || !rule}>
            {pending ? "부여하는 중…" : "부여"}
          </Button>
        </div>
      </form>

      {rules.length === 0 && (
        <p className="mt-3 text-xs text-mut">등록된 규정이 없습니다.</p>
      )}

      {/* role="alert"는 Note가 tone="error"에 저절로 붙인다. */}
      {state.error && (
        <Note tone="error" className="mt-3">
          {state.error}
        </Note>
      )}
      {state.ok && (
        <Note tone="success" className="mt-3">
          부여했습니다.
        </Note>
      )}
    </section>
  );
}
