"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { MERIT_KIND_LABELS, type MeritKind } from "@/core/authz/merit-track";

/** 부여된 내용. 성공한 순간의 값을 호출부가 찍어 넘긴다. */
export type AwardSuccess = {
  kind: string;
  label: string;
  points: number;
  /** 일괄 부여의 인원. 단건이면 null이라 인원 줄이 안 나온다. */
  count: number | null;
};

/**
 * 부여 성공 알림. 폼 아래 배너 대신 모달로 띄운다 — 반 명단은 화면이 길어서
 * 아래쪽 배너가 스크롤 밖에 있고, 그러면 눌렀는지 아닌지가 화면에 안 남는다.
 *
 * **저절로 닫히지 않는다.** 예전에는 2.2초 뒤 사라졌는데, 무엇을 몇 명에게 줬는지
 * 읽는 도중에 없어지면 다시 볼 방법이 최근 부여 화면뿐이다. 닫는 것은 사람이 한다.
 *
 * 열림 상태를 따로 들지 않는다. `result`가 곧 열림이고, 닫는 길(Esc·버튼·배경)은
 * 전부 `onClose`로 모여 호출부가 그것을 null로 만든다 — 상태가 두 군데면
 * 두 번째 성공에서 어긋난다.
 */
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
      // Esc로 닫히면 브라우저가 close를 준다. 호출부를 되맞추지 않으면 다음에 안 열린다.
      onClose={onClose}
      // 배경을 눌러도 닫는다 — 지울 것이 없는 알림이라 되돌릴 입력이 없다.
      onClick={onClose}
      aria-label="부여 완료"
      className="animate-award-pop rounded-modal border border-line bg-surface p-0 shadow-modal backdrop:bg-black/30"
    >
      {result && (
        <div className="w-80 max-w-full p-6 text-center">
          {/* 옅은 초록 바탕 + 진한 초록 체크. 진한 에메랄드(`bg-pri`)는 실행
              버튼의 자리라 장식으로 쓰지 않는다(디자인 기준 §색). */}
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
