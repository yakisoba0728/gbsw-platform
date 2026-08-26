"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { RulePicker, type RuleOption } from "@/components/merit/rule-picker";
import {
  AwardSuccessDialog,
  type AwardSuccess,
} from "@/components/merit/award-success-dialog";
import { EMPTY_MERIT_STATE } from "@/app/(app)/merit/action-state";
import { awardAction } from "@/app/(app)/merit/actions";

/** 상벌점 부여 카드. 항목 고르기 · 메모(선택) · 부여 버튼. */
export function AwardForm({
  studentProfileId,
  rules,
}: {
  studentProfileId: string;
  rules: RuleOption[];
}) {
  const [state, formAction, pending] = useActionState(awardAction, EMPTY_MERIT_STATE);
  // 고른 항목은 hidden input이 싣고 가지만, 제출 버튼을 잠그려면 화면도 알아야 한다.
  const [rule, setRule] = useState<RuleOption | null>(null);

  // 성공 알림에 쓸 값. 제출한 순간을 찍어 둔다 (class-roster.tsx와 같은 이유).
  const [submitted, setSubmitted] = useState<AwardSuccess | null>(null);
  const [success, setSuccess] = useState<AwardSuccess | null>(null);

  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok && submitted) setSuccess(submitted);
  }

  return (
    <SectionCard
      variant="panel"
      title="상벌점 부여"
      headingLevel={3}
      className="@container"
    >
      {/* 항목 고르기는 한 줄을 통째로 쓴다 — 검색 목록이 아래로 펼쳐진다. */}
      <form action={formAction} className="space-y-2.5">
        <input type="hidden" name="studentProfileId" value={studentProfileId} />

        <RulePicker rules={rules} onChange={setRule} />

        <div className="flex flex-col gap-2.5 @md:flex-row @md:flex-wrap @md:items-end">
          <div className="@md:min-w-[160px] @md:flex-1">
            {/* 액션이 끝나면 React가 폼을 reset한다. 실패 상태가 실어 온 제출값을
                defaultValue로 내려보내면 reset이 메모를 지우는 대신 되돌린다. */}
            <Input
              name="note"
              placeholder="메모 (선택)"
              aria-label="메모"
              defaultValue={state.note ?? ""}
            />
          </div>

          <Button
            type="submit"
            className="w-full @md:w-auto"
            disabled={pending || rules.length === 0 || !rule}
            onClick={() => {
              // 단건이라 인원 줄은 없다.
              if (rule) setSubmitted({ ...rule, count: null });
            }}
          >
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
      <AwardSuccessDialog
        result={success}
        onClose={() => setSuccess(null)}
      />
    </SectionCard>
  );
}
