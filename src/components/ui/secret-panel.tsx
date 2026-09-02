"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type CopyState = "idle" | "copied" | "failed";

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

export function SecretPanel({
  label,
  value,
  note,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
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
