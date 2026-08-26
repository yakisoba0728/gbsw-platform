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
  updatedAt,
  updatedLabel,
}: {
  track: MeritTrack;
  warn: number;
  danger: number;
  /** 학교가 한 번이라도 저장했는가. false면 지금 보이는 값은 기본값이다. */
  configured: boolean;
  /** 화면이 읽은 MeritThreshold.updatedAt. 저장된 적 없으면 null. */
  updatedAt: string | null;
  /** "이정민 · 2026-08-17 09:12" — 저장된 적 없으면 null. */
  updatedLabel: string | null;
}) {
  const fieldId = useId();
  const [state, formAction, pending] = useActionState(
    saveThresholdAction,
    EMPTY_THRESHOLD_FORM_STATE,
  );

  // React 19는 액션이 끝나면 폼을 자동 reset()한다 — 리셋이 되돌리는 값이
  // 곧 defaultValue다. 저장이 거부됐으면 방금 제출한 값을 내리고, 성공했으면
  // 서버가 다시 내려준 값을 쓴다. 계정 상세의 정보 수정 폼과 같은 방식이다.
  const kept = state.values;

  return (
    <div className="border-b border-line2 px-5 py-4 last:border-0">
      <form action={formAction} className="flex flex-wrap items-end gap-2.5">
        <input type="hidden" name="track" value={track} />
        <input type="hidden" name="updatedAt" value={updatedAt ?? ""} />

        <div className="w-26">
          <span className="mb-1.5 block text-caption font-medium text-mut">트랙</span>
          {/* 읽기 전용이지만 옆 입력칸과 한 줄에 서므로 같은 높이를 갖는다 —
              `py-3`으로 두었더니 44px이 되어 42px짜리 칸들보다 라벨이 2px 올라갔다. */}
          <p className="flex h-9 items-center text-sm font-medium text-ink">
            {MERIT_TRACK_LABELS[track]}
          </p>
        </div>

        <div className="w-31">
          <Label htmlFor={`${fieldId}-warn`}>경고 기준</Label>
          <Input
            id={`${fieldId}-warn`}
            name="warn"
            inputMode="numeric"
            defaultValue={kept?.warn ?? String(warn)}
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
            defaultValue={kept?.danger ?? String(danger)}
            required
            aria-describedby={`${fieldId}-help`}
          />
        </div>

        {/*
          행 안의 저장이라 secondary다. 규정 표의 인라인 편집도 같은 모양이고,
          여기는 트랙마다 한 줄이라 primary로 두면 한 카드에 에메랄드가 둘 선다 —
          그 순간 에메랄드는 「이 화면의 할 일」이라는 뜻을 잃는다.
        */}
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </form>

      <p id={`${fieldId}-help`} className="mt-2 text-caption text-mut">
        위험이 경고보다 커야 하고 둘 다 1~{MAX_THRESHOLD} 사이의 정수입니다.
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
