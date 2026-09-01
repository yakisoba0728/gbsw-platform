"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";

/**
 * 확인 모달.
 *
 * **사유는 기본이 필수다.** 이 모달이 처음에 삭제·취소용으로 만들어졌고, 그 자리는
 * 「왜」가 남지 않으면 감사로그가 반쪽이 되기 때문이다. 되돌릴 수 있는 동작에
 * 붙일 때는 `reasonRequired={false}`로 열어 준다 — 매번 한 줄을 받아 내면 점호처럼
 * 여러 건을 연달아 처리하는 자리에서 사람이 아무 글자나 적게 된다.
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
  /** 여는 버튼. 호출부마다 생김새가 달라 통째로 받는다. */
  trigger: (open: () => void) => ReactNode;
  title: string;
  description: ReactNode;
  /** 비우면 사유 칸이 아예 없다 — 폼이 이미 내용을 다 받은 화면(신청·부여)이 그렇다. */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** 비우고 눌러도 되는가. 기본은 필수다. */
  reasonRequired?: boolean;
  /** 사유 칸의 name. 담을 자리가 이미 있는 동작(반려의 decisionNote 등)이 바꾼다. */
  reasonName?: string;
  confirmLabel: string;
  /** 확인 버튼의 색. 되돌릴 수 있는 동작은 danger가 아니다. */
  confirmVariant?: "danger" | "primary";
  pendingLabel: string;
  /** `useActionState`가 준 dispatch */
  action: (formData: FormData) => void;
  pending: boolean;
  /**
   * `useActionState`가 준 state를 **그대로** 넘긴다. 이 모달은 "결과가 새로
   * 왔는가"를 객체 **동일성**으로 판정하므로, 여기서 `{ ok: …, error: … }`를
   * 새로 지어 넘기면 제출 순간의 pending 재렌더가 곧 새 객체가 되어 서버
   * 응답 전에 닫힌다. 액션 상태에 `ok`가 없으면 액션 쪽에 더한다.
   */
  state: ConfirmDialogState;
  /** 사유 칸 위에 들어갈 입력들 — 승인의 「전화로 보호자 확인함」 같은 것. */
  extra?: ReactNode;
  /** 폼이 함께 보낼 hidden input들 */
  children?: ReactNode;
}) {
  // `<dialog>`를 항상 렌더하므로 한 화면에 여러 개가 뜬다. 고정 id를 쓰면
  // 두 번째부터 입력칸이 접근 가능한 이름을 잃는다.
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
      // autoFocus는 못 쓴다 — React는 마운트 때 적용하는데 이 dialog는 닫힌 채 뜬다.
      // 사유가 선택이면 적을 것이 없으므로 확인 버튼에 초점을 준다 — 그래야 Enter
      // 한 번으로 끝난다.
      if (reasonLabel && reasonRequired) reasonRef.current?.focus();
      else confirmRef.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open, reasonLabel, reasonRequired]);

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
                // textarea에서 Enter는 줄바꿈이므로 표준 대체키로도 제출할 수 있게 둔다.
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={reasonPlaceholder}
                required={reasonRequired}
                // cancelSchema의 상한과 같다.
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
