import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * 폼·화면이 결과를 알리는 한 줄 배너. 22곳에 같은 클래스 문자열이 복붙돼 있었다.
 *
 * **tone="error"면 `role="alert"`가 저절로 붙는다.** 빠뜨릴 수 있게 두지 않는
 * 이유: 명단 반영 화면(import-form)의 오류 배너 세 곳이 정확히 그걸 빠뜨리고
 * 있었고, 하필 그 화면이 되돌릴 수 없는 동작(전교생 명단 확정)을 다룬다.
 * 화면을 못 보는 사람에게 실패가 전달되지 않으면 그대로 다음 단추를 누른다.
 *
 * 마진은 호출부가 정한다(`mt-3`/`mb-4`/`mx-5 mt-4` …) — 배너가 어디에 놓이느냐는
 * 배너의 성질이 아니라 그 화면의 짜임이라 여기서 정할 수 없다.
 */
export type NoteTone = "error" | "success" | "warn";

const TONES: Record<NoteTone, string> = {
  error: "bg-rose-soft text-rose",
  success: "bg-green-soft text-green",
  warn: "bg-amber-soft text-amber-ink",
};

export function Note({
  tone,
  className,
  ...props
}: ComponentProps<"p"> & { tone: NoteTone }) {
  return (
    <p
      // 경고(warn)에도 알림이 필요한 자리가 있다 — 명단 미리보기의 주의 문구가
      // 그렇다. 기본값만 여기서 정하고, 호출부가 명시하면 그쪽이 이긴다
      // (아래 {...props}가 뒤에 오므로).
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "rounded-btn px-3 py-2.5 text-[13px] font-semibold",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
