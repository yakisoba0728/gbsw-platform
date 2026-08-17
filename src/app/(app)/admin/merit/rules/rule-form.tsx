"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { Select } from "@/components/ui/select";
import { MERIT_KIND_LABELS, MERIT_KINDS, type MeritTrack } from "@/core/authz/merit-track";
import { EMPTY_RULE_FORM_STATE } from "./action-state";
import { createRuleAction } from "./actions";

/** 규정 추가 카드. 넓으면 한 줄에 나란히 서고, 좁으면 칸마다 한 줄을 쓴다. */
export function RuleForm({ track }: { track: MeritTrack }) {
  const [state, formAction, pending] = useActionState(
    createRuleAction,
    EMPTY_RULE_FORM_STATE,
  );

  return (
    <SectionCard variant="panel" title="규정 추가" className="@container">
      <form
        action={formAction}
        className="flex flex-col gap-2.5 @xl:flex-row @xl:flex-wrap @xl:items-end"
      >
        {/* track은 생성 시 고정 — 지금 보고 있는 탭 그대로 들어간다. */}
        <input type="hidden" name="track" value={track} />

        {/* 아래 다섯 칸의 폭은 loading.tsx의 뼈대 폭과 짝이다. 한쪽만 고치면 어긋난다. */}
        <div className="@xl:min-w-[180px] @xl:flex-[2]">
          <Label htmlFor="rf-label">항목명</Label>
          <Input
            id="rf-label"
            name="label"
            required
            maxLength={200}
            placeholder="예: 교내 봉사활동 우수 참여"
          />
        </div>

        <div className="@xl:min-w-[100px] @xl:flex-1">
          <Label htmlFor="rf-kind">종류</Label>
          <Select id="rf-kind" name="kind" defaultValue="MERIT">
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
            placeholder="5"
          />
        </div>

        <div className="@xl:min-w-[110px] @xl:flex-1">
          <Label htmlFor="rf-category">분류 (선택)</Label>
          <Input id="rf-category" name="category" maxLength={50} />
        </div>

        <div className="@xl:min-w-[160px] @xl:flex-[2]">
          <Label htmlFor="rf-description">설명 (선택)</Label>
          <Input id="rf-description" name="description" maxLength={500} />
        </div>

        <Button type="submit" className="w-full @xl:w-auto" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </form>

      {state.error && (
        <Note tone="error" className="mt-3">
          {state.error}
        </Note>
      )}
    </SectionCard>
  );
}
