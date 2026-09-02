"use client";

import { useActionState, useId } from "react";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { MERIT_TRACK_LABELS, type MeritTrack } from "@/core/authz/merit-track";
import { MAX_THRESHOLD } from "@/modules/merit/merit.schema";
import { EMPTY_THRESHOLD_FORM_STATE } from "./action-state";
import { saveThresholdAction } from "./actions";

function validateThresholdOrder(form: HTMLFormElement | null): void {
  if (!form) return;
  const warn = form.elements.namedItem("warn");
  const danger = form.elements.namedItem("danger");
  if (!(warn instanceof HTMLInputElement) || !(danger instanceof HTMLInputElement)) return;

  const invalidOrder =
    Number.isFinite(warn.valueAsNumber) &&
    Number.isFinite(danger.valueAsNumber) &&
    danger.valueAsNumber <= warn.valueAsNumber;
  danger.setCustomValidity(invalidOrder ? "위험 기준은 경고 기준보다 커야 합니다." : "");
}

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
  configured: boolean;
  updatedAt: string | null;
  updatedLabel: string | null;
}) {
  const fieldId = useId();
  const [state, formAction, pending] = useActionState(
    saveThresholdAction,
    EMPTY_THRESHOLD_FORM_STATE,
  );

  const kept = state.values;
  const trackLabel = MERIT_TRACK_LABELS[track];

  return (
    <div className="border-b border-line2 px-5 py-4 last:border-0">
      <form
        action={formAction}
        aria-label={`${trackLabel} 벌점 기준 설정`}
        className="flex flex-wrap items-end gap-2.5"
      >
        <input type="hidden" name="track" value={track} />
        <input type="hidden" name="updatedAt" value={updatedAt ?? ""} />

        <div className="w-26">
          <span className="mb-1.5 block text-caption font-medium text-mut">트랙</span>
          <p className="flex h-9 items-center text-sm font-medium text-ink">
            {trackLabel}
          </p>
        </div>

        <div className="w-31">
          <Label htmlFor={`${fieldId}-warn`}>경고 기준</Label>
          <Input
            id={`${fieldId}-warn`}
            name="warn"
            type="number"
            min={1}
            max={MAX_THRESHOLD}
            step={1}
            defaultValue={kept?.warn ?? String(warn)}
            required
            aria-label={`${trackLabel} 경고 기준`}
            aria-describedby={`${fieldId}-help`}
            onInput={(event) => validateThresholdOrder(event.currentTarget.form)}
          />
        </div>

        <div className="w-31">
          <Label htmlFor={`${fieldId}-danger`}>위험 기준</Label>
          <Input
            id={`${fieldId}-danger`}
            name="danger"
            type="number"
            min={1}
            max={MAX_THRESHOLD}
            step={1}
            defaultValue={kept?.danger ?? String(danger)}
            required
            aria-label={`${trackLabel} 위험 기준`}
            aria-describedby={`${fieldId}-help`}
            onInput={(event) => validateThresholdOrder(event.currentTarget.form)}
          />
        </div>

        <ConfirmSubmit
          label="저장"
          ariaLabel={`${trackLabel} 벌점 기준 저장`}
          title={`${trackLabel} 벌점 기준 저장`}
          description="이 트랙의 경고·위험 기준이 바뀝니다."
          confirmLabel="저장"
          pendingLabel="저장 중…"
          pending={pending}
          variant="secondary"
          size="md"
          full={false}
        />
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
          {trackLabel} 기준을 저장했습니다.
        </Note>
      )}
    </div>
  );
}
