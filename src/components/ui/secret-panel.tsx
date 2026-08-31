"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type CopyState = "idle" | "copied" | "failed";

/** Clipboard API가 없는 구형·비보안 브라우저에서도 사용자 클릭 안에서 복사한다. */
async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();

  try {
    if (!document.execCommand("copy")) throw new Error("copy failed");
  } finally {
    field.remove();
  }
}

/**
 * 방금 발급돼 이 화면에서만 볼 수 있는 값 — 초대코드·임시 비밀번호·가입코드.
 *
 * 세 곳이 각자 그리고 있었고, 하필 학생이 부모에게 불러 줘야 하는 가입코드가
 * 셋 중 가장 안 눈에 띄었다. 값은 mono로 낸다 — 사람이 한 글자씩 옮겨 적는다.
 */
export function SecretPanel({
  label,
  value,
  note,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** 값 아래 한 줄. "이 화면을 벗어나면 다시 볼 수 없습니다" 같은 것. */
  note?: ReactNode;
  className?: string;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyable = typeof value === "string";
  const copyLabel = typeof label === "string" ? `${label} 복사` : "값 복사";

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  async function handleCopy() {
    if (!copyable) return;
    try {
      await copyText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState("idle"), 2500);
  }

  return (
    <div
      className={cn(
        "rounded-btn border border-pri-line bg-pri-soft px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-pri-ink">{label}</p>
        {copyable && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={copyLabel}
            onClick={handleCopy}
          >
            {copyState === "copied" ? "복사됨" : "복사"}
          </Button>
        )}
      </div>
      <p className="mt-1 font-mono text-title font-semibold break-all text-ink select-all">
        {value}
      </p>
      {note && <p className="mt-1.5 text-xs text-mut">{note}</p>}
      {copyState !== "idle" && (
        <p
          className={cn(
            "mt-1.5 text-xs font-medium",
            copyState === "copied" ? "text-green" : "text-rose",
          )}
          role="status"
          aria-live="polite"
        >
          {copyState === "copied"
            ? "클립보드에 복사했습니다."
            : "복사하지 못했습니다. 값을 직접 선택해 복사해 주세요."}
        </p>
      )}
    </div>
  );
}
