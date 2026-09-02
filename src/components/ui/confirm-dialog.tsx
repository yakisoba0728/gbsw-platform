"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";

export type ConfirmDialogState = { ok: boolean; error: string | null };

export function ConfirmDialog({
  trigger,
  title,
  description,
  reasonLabel,
  reasonPlaceholder,
  reasonRequired = true,
  reasonName = "reason",
  confirmLabel,
  confirmVariant = "danger",
  pendingLabel,
  action,
  pending,
  state,
  extra,
  children,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description: ReactNode;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
  reasonName?: string;
  confirmLabel: string;
  confirmVariant?: "danger" | "primary";
  pendingLabel: string;
  action: (formData: FormData) => void;
  pending: boolean;
  state: ConfirmDialogState;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      if (reasonLabel && reasonRequired) reasonRef.current?.focus();
      else confirmRef.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open, reasonLabel, reasonRequired]);

  // 호출자는 useActionState 결과를 그대로 전달해야 새 성공 응답만 닫힌다.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }

  function handleOpen() {
    setReason("");
    setOpen(true);
  }

  return (
    <>
      {trigger(handleOpen)}

      <dialog
        ref={dialogRef}
        aria-labelledby={`${baseId}-title`}
        onClose={() => setOpen(false)}
        className="rounded-modal border border-line bg-surface p-0 shadow-modal backdrop:bg-black/40"
      >
        <form action={action} className="w-105 max-w-full p-6">
          {children}

          <h2 id={`${baseId}-title`} className="text-lg font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-caption text-mut">{description}</p>

          {extra && <div className="mt-5 space-y-2">{extra}</div>}

          {reasonLabel && (
            <>
              <label
                htmlFor={`${baseId}-reason`}
                className="mt-5 mb-1.5 block text-caption font-medium text-ink"
              >
                {reasonLabel}
                {!reasonRequired && (
                  <span className="font-normal text-mut"> (선택)</span>
                )}
              </label>
              <Textarea
                ref={reasonRef}
                id={`${baseId}-reason`}
                name={reasonName}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={reasonPlaceholder}
                required={reasonRequired}
                maxLength={500}
              />
            </>
          )}

          {state.error && (
            <Note tone="error" className="mt-2">
              {state.error}
            </Note>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              닫기
            </Button>
            <Button
              ref={confirmRef}
              type="submit"
              variant={confirmVariant}
              disabled={
                pending || (!!reasonLabel && reasonRequired && reason.trim() === "")
              }
            >
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
