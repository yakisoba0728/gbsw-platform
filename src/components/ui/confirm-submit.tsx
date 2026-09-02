"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";

export function ConfirmSubmit({
  label,
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending,
  disabled = false,
  ariaLabel,
  variant = "primary",
  size = "lg",
  full = true,
  form,
  onOpen,
}: {
  label: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  full?: boolean;
  form?: string;
  onOpen?: () => void;
}) {
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      confirmRef.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  function confirm() {
    setOpen(false);
    triggerRef.current?.form?.requestSubmit();
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        form={form}
        variant={variant}
        size={size}
        full={full}
        disabled={pending || disabled}
        aria-label={ariaLabel}
        aria-busy={pending || undefined}
        onClick={() => {
          const form = triggerRef.current?.form;
          if (form && !form.reportValidity()) return;
          onOpen?.();
          setOpen(true);
        }}
      >
        {pending ? pendingLabel : label}
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${baseId}-title`}
        onClose={() => setOpen(false)}
        className="rounded-modal border border-line bg-surface p-0 shadow-modal backdrop:bg-black/40"
      >
        <div className="w-105 max-w-full p-6">
          <h2 id={`${baseId}-title`} className="text-lg font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-caption text-mut">{description}</p>

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              닫기
            </Button>
            <Button ref={confirmRef} type="button" variant={variant} onClick={confirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
