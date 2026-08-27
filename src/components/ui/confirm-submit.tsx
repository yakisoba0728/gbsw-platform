"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";

/**
 * **이미 다 채운 폼**을 한 번 더 묻는 버튼.
 *
 * `ConfirmDialog`와 나뉘는 지점이 분명하다 — 그쪽은 모달 안에서 사유를 받아 자기
 * 폼으로 보내고, 이쪽은 **바깥 폼을 그대로 제출한다.** 신청·부여처럼 화면이 이미
 * 행선지·사유·기간을 다 받은 자리는 모달에서 또 물을 것이 없다.
 *
 * 바깥 폼을 찾는 방법은 `button.form`이다 — 이 버튼이 그 폼 안에 있으므로
 * ref를 타고 올라갈 필요가 없다.
 */
export function ConfirmSubmit({
  label,
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending,
  variant = "primary",
  size = "lg",
  full = true,
}: {
  label: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  full?: boolean;
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
    // 폼의 required 검사를 건너뛰지 않는다 — requestSubmit이 그대로 돌린다.
    triggerRef.current?.form?.requestSubmit();
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant={variant}
        size={size}
        full={full}
        disabled={pending}
        onClick={() => {
          // 빈 칸이 있으면 모달을 열기 전에 브라우저가 먼저 짚어 준다.
          const form = triggerRef.current?.form;
          if (form && !form.reportValidity()) return;
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
