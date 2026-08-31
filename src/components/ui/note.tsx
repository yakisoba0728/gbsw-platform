import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type NoteTone = "error" | "success" | "warn";

const TONES: Record<NoteTone, string> = {
  error: "border-rose-line bg-rose-soft text-rose",
  success: "border-green-line bg-green-soft text-green",
  warn: "border-amber-line bg-amber-soft text-amber-ink",
};

/**
 * 결과를 알리는 한 줄 배너. tone="error"면 role="alert"가 자동으로 붙는다 —
 * 화면을 못 보는 사람에게 실패가 전달되지 않으면 그대로 다음 단추를 누른다.
 * 마진은 배너가 놓이는 화면이 정한다.
 */
export function Note({
  tone,
  className,
  ...props
}: ComponentProps<"p"> & { tone: NoteTone }) {
  return (
    <p
      role={tone === "error" ? "alert" : tone === "success" ? "status" : undefined}
      className={cn(
        "rounded-btn border px-3 py-2 text-caption font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
