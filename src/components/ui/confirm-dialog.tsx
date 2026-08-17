"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";

/**
 * 사유 입력이 필수인 확인 모달.
 *
 * 네이티브 `<dialog>` + `showModal()`을 쓴다 — 포커스 가두기·Esc 닫기·뒤쪽 비활성화를
 * 공짜로 준다. 가운데 정렬은 globals.css의 `dialog:modal { margin: auto }`가 맡는다.
 *
 * 상태는 `useActionState`의 결과를 통째로 받는다. 성공 플래그(boolean)만 받으면
 * 두 번째 성공에서 값이 그대로라 모달이 열린 채 남는다.
 */
export type ConfirmDialogState = { ok: boolean; error: string | null };

export function ConfirmDialog({
  trigger,
  title,
  description,
  reasonLabel,
  reasonPlaceholder,
  confirmLabel,
  pendingLabel,
  action,
  pending,
  state,
  children,
}: {
  /** 여는 버튼. 호출부마다 생김새가 달라 통째로 받는다. */
  trigger: (open: () => void) => ReactNode;
  title: string;
  description: ReactNode;
  reasonLabel: string;
  reasonPlaceholder: string;
  confirmLabel: string;
  pendingLabel: string;
  /** `useActionState`가 준 dispatch */
  action: (formData: FormData) => void;
  pending: boolean;
  state: ConfirmDialogState;
  /** 폼이 함께 보낼 hidden input들 */
  children?: ReactNode;
}) {
  // `<dialog>`를 항상 렌더하므로 한 화면에 여러 개가 뜬다. 고정 id를 쓰면
  // 두 번째부터 입력칸이 접근 가능한 이름을 잃는다.
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // autoFocus는 못 쓴다 — React는 마운트 때 적용하는데 이 dialog는 닫힌 채 뜬다.
      reasonRef.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  // 성공하면 닫고, 실패하면 쓰던 사유를 남겨 고쳐서 다시 누를 수 있게 한다.
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
        // Esc로 닫히면 브라우저가 close를 준다. 상태를 되맞추지 않으면 다음에 안 열린다.
        onClose={() => setOpen(false)}
        // 배경 클릭으로 닫지 않는다 — 쓰던 사유가 날아간다.
        className="rounded-modal border border-line bg-surface p-0 shadow-modal backdrop:bg-black/40"
      >
        <form action={action} className="w-105 max-w-full p-6">
          {children}

          <h2 id={`${baseId}-title`} className="text-lg font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-caption text-mut">{description}</p>

          <label
            htmlFor={`${baseId}-reason`}
            className="mt-5 mb-1.5 block text-caption font-medium text-ink"
          >
            {reasonLabel}
          </label>
          <Textarea
            ref={reasonRef}
            id={`${baseId}-reason`}
            name="reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            // textarea에서 Enter는 줄바꿈이므로 표준 대체키로도 제출할 수 있게 둔다.
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={reasonPlaceholder}
            required
            // cancelSchema·cancelBatchSchema의 상한과 같다.
            maxLength={500}
          />

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
              type="submit"
              variant="danger"
              disabled={pending || reason.trim() === ""}
            >
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
