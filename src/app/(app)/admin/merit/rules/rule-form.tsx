"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { MERIT_KIND_LABELS, MERIT_KINDS, type MeritTrack } from "@/core/authz/merit-track";
import { EMPTY_RULE_FORM_STATE } from "./action-state";
import { createRuleAction } from "./actions";

export function RuleForm({
  track,
  trackTabs,
}: {
  track: MeritTrack;
  trackTabs: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(
    createRuleAction,
    EMPTY_RULE_FORM_STATE,
  );

  const values = state.values;
  const kind = values?.kind || "MERIT";

  return (
    <SectionCard
      variant="panel"
      title="규정 추가"
      aside={trackTabs}
      className="@container"
    >
      <form
        action={formAction}
        className="flex flex-col gap-2.5 @xl:flex-row @xl:flex-wrap @xl:items-end"
      >
        <input type="hidden" name="track" value={track} />

        <div className="@xl:min-w-[180px] @xl:flex-[2]">
          <Label htmlFor="rf-label">항목명</Label>
          <Input
            id="rf-label"
            name="label"
            required
            maxLength={200}
            defaultValue={values?.label ?? ""}
            placeholder="예: 교내 봉사활동 우수 참여"
          />
        </div>

        <div className="@xl:min-w-[100px] @xl:flex-1">
          <Label htmlFor="rf-kind">종류</Label>
          <Select id="rf-kind" name="kind" key={kind} defaultValue={kind}>
            {MERIT_KINDS.map((k) => (
              <option key={k} value={k}>
                {MERIT_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>

        <div className="@xl:w-[90px]">
          <Label htmlFor="rf-points">점수</Label>
          <Input
            id="rf-points"
            name="points"
            inputMode="numeric"
            required
            defaultValue={values?.points ?? ""}
            placeholder="5"
          />
        </div>

        <div className="@xl:min-w-[110px] @xl:flex-1">
          <Label htmlFor="rf-category">분류 (선택)</Label>
          <Input
            id="rf-category"
            name="category"
            maxLength={50}
            defaultValue={values?.category ?? ""}
          />
        </div>

        <div className="@xl:min-w-[160px] @xl:flex-[2]">
          <Label htmlFor="rf-description">설명 (선택)</Label>
          <Input
            id="rf-description"
            name="description"
            maxLength={500}
            defaultValue={values?.description ?? ""}
          />
        </div>

        <ConfirmSubmit
          label="저장"
          title="규정 추가"
          description="부여 화면의 선택지에 곧바로 나타납니다."
          confirmLabel="저장"
          pendingLabel="저장 중…"
          pending={pending}
          size="md"
          full={false}
        />
      </form>

      {state.error && (
        <Note tone="error" className="mt-3">
          {state.error}
        </Note>
      )}
    </SectionCard>
  );
}
