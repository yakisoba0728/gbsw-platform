"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { MERIT_TRACK_LABELS, type MeritTrack } from "@/core/authz/merit-track";
import { MAX_THRESHOLD } from "@/modules/merit/merit.schema";
import { EMPTY_THRESHOLD_FORM_STATE } from "./action-state";
import { saveThresholdAction } from "./actions";

/**
 * 트랙 하나의 기준 폼. 트랙마다 폼이 따로다 — 한 폼으로 묶으면 감사로그가
 * 트랙별로 안 남고 한쪽만 고치려다 다른 쪽까지 덮어쓴다.
 */
export function ThresholdForm({
  track,
  warn,
  danger,
  configured,
  updatedLabel,
}: {
  track: MeritTrack;
  warn: number;
  danger: number;
  /** 학교가 한 번이라도 저장했는가. false면 지금 보이는 값은 기본값이다. */
  configured: boolean;
  /** "이정민 · 2026-08-17 09:12" — 저장된 적 없으면 null. */
  updatedLabel: string | null;
}) {
  const fieldId = useId();
  const [state, formAction, pending] = useActionState(
    saveThresholdAction,
    EMPTY_THRESHOLD_FORM_STATE,
  );

  return (
    <div className="border-b border-line2 px-5 py-4 last:border-0">
      <form action={formAction} className="flex flex-wrap items-end gap-2.5">
        <input type="hidden" name="track" value={track} />

        <div className="w-26">
          <span className="mb-1.5 block text-caption font-medium text-mut">트랙</span>
          <p className="py-3 text-sm font-medium text-ink">
            {MERIT_TRACK_LABELS[track]}
          </p>
        </div>

        <div className="w-31">
          <Label htmlFor={`${fieldId}-warn`}>경고 기준</Label>
          <Input
            id={`${fieldId}-warn`}
            name="warn"
            inputMode="numeric"
            defaultValue={String(warn)}
            required
            aria-describedby={`${fieldId}-help`}
          />
        </div>

        <div className="w-31">
          <Label htmlFor={`${fieldId}-danger`}>위험 기준</Label>
          <Input
            id={`${fieldId}-danger`}
            name="danger"
            inputMode="numeric"
            defaultValue={String(danger)}
            required
            aria-describedby={`${fieldId}-help`}
          />
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </form>

      <p id={`${fieldId}-help`} className="mt-2 text-caption text-mut">
        경고 기준부터 진하게, 위험 기준부터 붉은 배경으로 보입니다. 위험이 경고보다
        커야 하고 둘 다 1~{MAX_THRESHOLD} 사이의 정수입니다.
        {configured && updatedLabel ? (
          <> · 마지막 변경 {updatedLabel}</>
        ) : (
          <> · 아직 정한 적이 없어 기본값을 쓰고 있습니다.</>
        )}
      </p>

      {state.error && (
        <Note tone="error" className="mt-2.5">
          {state.error}
        </Note>
      )}
      {state.ok && (
        <Note tone="success" className="mt-2.5">
          {MERIT_TRACK_LABELS[track]} 기준을 저장했습니다.
        </Note>
      )}
    </div>
  );
}
