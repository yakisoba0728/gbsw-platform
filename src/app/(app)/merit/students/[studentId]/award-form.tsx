"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { RulePicker, type RuleOption } from "@/components/merit/rule-picker";
import { EMPTY_MERIT_STATE } from "@/app/(app)/merit/action-state";
import { awardAction } from "@/app/(app)/merit/actions";

/** 시안의 "상벌점 부여" 카드. 항목 고르기 · 발생일 · 메모(선택) · 부여 버튼. */
export function AwardForm({
  studentProfileId,
  rules,
  today,
}: {
  studentProfileId: string;
  rules: RuleOption[];
  /**
   * 오늘 날짜(KST, `YYYY-MM-DD`). **서버가 계산해 내려준다** — 클라이언트에서
   * 만들면 SSR이 그린 값과 어긋나 하이드레이션이 깨진다.
   */
  today: string;
}) {
  const fieldId = useId();
  const [state, formAction, pending] = useActionState(awardAction, EMPTY_MERIT_STATE);
  // 고른 항목은 hidden input이 싣고 가지만, 제출 버튼을 잠그려면 화면도 알아야 한다.
  const [rule, setRule] = useState<RuleOption | null>(null);

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="mb-3.5 text-[13px] font-bold text-ink">상벌점 부여</h2>

      {/*
        항목 고르기를 한 줄 위로 뺐다 — 검색 목록이 아래로 펼쳐지므로 메모·버튼과
        같은 줄에 두면 390px에서 서로 밀어낸다.
      */}
      <form action={formAction} className="space-y-2.5">
        <input type="hidden" name="studentProfileId" value={studentProfileId} />

        <RulePicker rules={rules} onChange={setRule} />

        <div className="flex flex-wrap items-end gap-2.5">
          {/*
            발생일은 기본이 오늘이지만 고칠 수 있어야 한다 — 사감은 어젯밤 점호를
            아침에 넣고, 교사는 금요일 일을 월요일에 넣는다. max로 미래를 막아
            흔한 오타(연도 잘못 침)를 여기서 걸러 준다. 학년도 창 검사는 서버가 한다.
          */}
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
