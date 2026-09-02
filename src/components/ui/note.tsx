import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type NoteTone = "error" | "success" | "warn";

const TONES: Record<NoteTone, string> = {
  error: "border-rose-line bg-rose-soft text-rose",
  success: "border-green-line bg-green-soft text-green",
  warn: "border-amber-line bg-amber-soft text-amber-ink",
};

export function Note({
  tone,
  className,
  ...props
}: ComponentProps<"p"> & { tone: NoteTone }) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "rounded-btn border px-3 py-2 text-caption font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
