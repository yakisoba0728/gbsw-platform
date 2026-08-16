"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";

/**
 * 사유 입력이 필수인 확인 모달.
 *
 * ## 왜 네이티브 `<dialog>`인가
 * 취소 확인이 두 방식으로 구현돼 있었다 — 하나는 `<dialog>` + `showModal()`,
 * 다른 하나는 손으로 만든 `fixed inset-0` 오버레이. 뒤쪽에는 **포커스 가두기·
 * Esc 닫기·뒤쪽 요소 비활성화가 전부 없었고**, 열려 있는 동안 트리거를 렌더에서
 * 빼버려서 모달이 열리는 순간 포커스가 `<body>`로 떨어졌다(키보드 사용자는
 * 모달 안으로 들어갈 방법이 없었다). 그 셋은 `showModal()`이 공짜로 해 준다 —
 * `app-shell/mobile-nav.tsx`가 `<dialog>`를 쓰는 이유로 드는 것과 같은 셋이다.
 *
 * 가운데 정렬은 `globals.css`의 `dialog:modal { margin: auto }`가 되살려 둔다
 * (Tailwind 리셋이 UA의 margin을 죽인다).
 *
 * 여닫기는 `open` 상태 + effect로 한다(mobile-nav와 같은 방식). `<dialog open>`
 * 속성으로 열면 모달이 아니라서 포커스도 안 갇히고 backdrop도 안 생긴다.
 *
 * ## id는 useId()로 만든다
 * `<dialog>`를 조건부가 아니라 **항상** 렌더하므로, 한 화면에 이 컴포넌트가 N개면
 * 라벨 id도 N개가 된다. 고정 문자열을 쓰면 두 번째 이후 모달의 입력칸이
 * 접근 가능한 이름을 잃는다 — 최근 부여 화면은 묶음마다 하나씩 달린다.
 *
 * ## 상태는 호출부가 들고 있다
 * `useActionState`의 결과를 통째로 받는다. 성공 플래그(boolean)만 받으면 두 번째
 * 성공에서 값이 `true` → `true`로 그대로라 effect가 다시 돌지 않아 모달이 열린 채
 * 남는다. 객체는 매번 새로 오므로 참조 비교가 성립한다. 서버 액션과 오류 문구
 * 사전은 화면(app/)의 것이라 여기서 import하지 않는다 — 모양만 맞으면 받는다.
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
  /** 여는 버튼. 호출부마다 생김새가 달라(표 안 작은 글씨 vs 버튼) 통째로 받는다. */
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
      // showModal()이 첫 포커스 가능 요소로 옮겨 주지만 hidden input 순서에
      // 기대지 않고 직접 옮긴다. autoFocus는 쓸 수 없다 — React는 마운트 때
      // 적용하는데 이 dialog는 닫힌 채로 마운트된다.
      reasonRef.current?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  // 성공하면 닫는다. 실패하면 쓰던 사유를 남겨 두어 고쳐서 다시 누를 수 있게 한다.
  // 렌더 중 이전 상태와 비교해 처리한다 — effect 안에서 곧바로 setState하면
  // 리렌더가 한 번 더 돈다 (rule-table.tsx·class-roster.tsx와 같은 패턴).
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
        // Esc로 닫히면 브라우저가 close 이벤트를 준다 — 상태를 되맞춰 두지
        // 않으면 다음에 눌러도 open이 이미 true라 effect가 안 돈다.
        onClose={() => setOpen(false)}
        // 배경 클릭으로는 닫지 않는다 — 사유를 쓰다가 잘못 눌러 날아가면
        // 처음부터 다시 써야 한다.
        className="rounded-card border border-line bg-surface p-0 backdrop:bg-black/40"
      >
        <form action={action} className="w-[420px] max-w-full p-5">
          {children}

          <h2 id={`${baseId}-title`} className="text-base font-extrabold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-[13px] text-mut">{description}</p>

          <label
            htmlFor={`${baseId}-reason`}
            className="mt-4 mb-1 block text-[12px] font-semibold text-mut"
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
            // 한 줄 입력이었다면 Enter가 곧 제출이지만 textarea에서는 줄바꿈이다.
            // 사유는 대개 한 문장이라 그 손버릇이 남아 있어서, 표준 대체키인
            // Ctrl/⌘+Enter로 제출할 수 있게 둔다. Enter 자체는 줄바꿈으로 남긴다
            // — 여러 줄을 쓰는 경우가 실제로 있다.
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={reasonPlaceholder}
            required
            // 스키마(cancelSchema·cancelBatchSchema)의 상한과 같다.
            maxLength={500}
          />

          {state.error && (
            <Note tone="error" className="mt-2">
              {state.error}
            </Note>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
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
