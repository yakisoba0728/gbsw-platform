"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { Select } from "@/components/ui/select";
import { MERIT_KIND_LABELS, MERIT_KINDS, type MeritTrack } from "@/core/authz/merit-track";
import { EMPTY_RULE_FORM_STATE } from "./action-state";
import { createRuleAction } from "./actions";

/** 시안의 "규정 추가" 카드(520~537행) — 한 줄에 나란히, 오른쪽 끝에 추가 버튼. */
export function RuleForm({ track }: { track: MeritTrack }) {
  const [state, formAction, pending] = useActionState(
    createRuleAction,
    EMPTY_RULE_FORM_STATE,
  );

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <h2 className="mb-3.5 text-[13px] font-bold text-ink">규정 추가</h2>

      <form action={formAction} className="flex flex-wrap items-end gap-2.5">
        {/* track은 생성 시 고정 — 지금 보고 있는 탭 그대로 들어간다. */}
        <input type="hidden" name="track" value={track} />

        <div className="min-w-[180px] flex-[2]">
          <Label htmlFor="rf-label">항목명</Label>
          <Input
            id="rf-label"
            name="label"
            required
            maxLength={200}
            placeholder="예: 교내 봉사활동 우수 참여"
          />
        </div>

        <div className="min-w-[100px] flex-1">
          <Label htmlFor="rf-kind">종류</Label>
          <Select id="rf-kind" name="kind" defaultValue="MERIT">
            {MERIT_KINDS.map((k) => (
              <option key={k} value={k}>
                {MERIT_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-[90px]">
          <Label htmlFor="rf-points">점수</Label>
          <Input
            id="rf-points"
            name="points"
            inputMode="numeric"
            required
            placeholder="5"
          />
        </div>

        <div className="min-w-[110px] flex-1">
          <Label htmlFor="rf-category">분류 (선택)</Label>
          <Input id="rf-category" name="category" maxLength={50} />
        </div>

        <div className="min-w-[160px] flex-[2]">
          <Label htmlFor="rf-description">설명 (선택)</Label>
          <Input id="rf-description" name="description" maxLength={500} />
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "추가 중…" : "추가"}
        </Button>
      </form>

      {state.error && (
        <Note tone="error" className="mt-3">
          {state.error}
        </Note>
      )}
    </section>
  );
}
