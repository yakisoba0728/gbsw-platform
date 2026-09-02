"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { MERIT_KIND_LABELS, type MeritKind } from "@/core/authz/merit-track";

export type AwardSuccess = {
  kind: string;
  label: string;
  points: number;
  count: number | null;
};

export function AwardSuccessDialog({
  result,
  onClose,
}: {
  result: AwardSuccess | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (!result) {
      if (el.open) el.close();
      return;
    }
    if (!el.open) el.showModal();
  }, [result]);

  const kindLabel = result
    ? (MERIT_KIND_LABELS[result.kind as MeritKind] ?? result.kind)
    : "";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={onClose}
      aria-label="부여 완료"
      className="animate-award-pop rounded-modal border border-line bg-surface p-0 shadow-modal backdrop:bg-black/30"
    >
      {result && (
        <div className="w-80 max-w-full p-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-pri-soft">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-award-check text-pri-ink"
              aria-hidden
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>

          <p className="mt-4 text-caption text-mut">
            {result.count === null ? kindLabel : `${result.count}명에게 ${kindLabel}`}
          </p>
          <p className="mt-1 text-lg font-semibold text-ink">{result.label}</p>
          <p className={`mt-1 text-title font-semibold ${kindColorClass(result.kind)}`}>
            {signedPoints(result.kind, result.points)}
          </p>
          <p className="mt-3 text-caption text-mut">부여했습니다</p>

          <Button
            type="button"
            variant="secondary"
            className="mt-5 w-full"
            onClick={onClose}
          >
            닫기
          </Button>
        </div>
      )}
    </dialog>
  );
}
