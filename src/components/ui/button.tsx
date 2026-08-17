import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "approve"
  | "reject"
  | "ghost"
  | "chip";

export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  // 에메랄드 위 글자는 근검정이다. 흰 글자는 대비가 2:1까지 떨어진다.
  primary: "border-transparent bg-pri text-on-pri hover:bg-pri-press",
  secondary: "border-line-strong bg-surface text-ink hover:bg-soft",
  danger: "border-rose-line bg-surface text-rose hover:bg-rose-soft",
  approve: "border-transparent bg-green text-white hover:bg-green-press",
  reject: "border-transparent bg-rose text-white hover:bg-rose-press",
  ghost: "border-transparent bg-transparent text-ink hover:bg-soft",
  chip: "border-line bg-surface text-mut hover:bg-soft hover:text-ink",
};

/** 고른 칩. 초록이 아니라 잉크색이다 — 에메랄드는 실행 버튼에만 남긴다. */
const CHIP_ACTIVE = "border-ink bg-ink text-white hover:bg-ink";

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-caption",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-4 text-sm",
};

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  /** chip variant에서 선택 상태 */
  active?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  full = false,
  active = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const isChip = variant === "chip";

  return (
    <button
      type={type}
      // 선택 상태를 색으로만 알리지 않는다. {...props}가 뒤에 오므로 호출부가 이긴다.
      aria-pressed={isChip ? active : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 border font-medium leading-none whitespace-nowrap",
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        "disabled:pointer-events-none disabled:opacity-40",
        isChip ? "rounded-full" : "rounded-btn",
        isChip && active ? CHIP_ACTIVE : VARIANTS[variant],
        SIZES[size],
        full && "w-full",
        className,
      )}
      {...props}
    />
  );
}
