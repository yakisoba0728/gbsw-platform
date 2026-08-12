import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/**
 * 시안의 Btn 컴포넌트를 Tailwind로 옮긴 것.
 * variant/size 조합은 "UI 디자인 재개발/Btn.dc.html"의 renderVals()와 1:1 대응한다.
 */
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
  primary: "border-transparent bg-pri text-white hover:bg-pri-press",
  secondary: "border-line bg-surface text-ink hover:bg-soft",
  danger: "border-rose-line bg-surface text-rose hover:bg-rose-soft",
  approve: "border-transparent bg-green text-white hover:bg-green-press",
  reject: "border-transparent bg-rose text-white hover:bg-rose-press",
  ghost: "border-transparent bg-transparent text-pri hover:bg-pri-soft",
  chip: "border-line bg-surface text-mut hover:bg-soft",
};

/** chip variant는 선택 상태를 별도로 그린다. */
const CHIP_ACTIVE = "border-pri bg-pri text-white hover:bg-pri-press";

const SIZES: Record<ButtonSize, string> = {
  sm: "text-[12.5px] px-3.5 py-[7px]",
  md: "text-sm px-[18px] py-[11px]",
  lg: "text-[14.5px] px-[18px] py-3.5",
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
      className={cn(
        "inline-flex items-center justify-center gap-1.5 border font-bold leading-tight whitespace-nowrap",
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pri",
        "disabled:pointer-events-none disabled:opacity-50",
        isChip ? "rounded-full" : size === "lg" ? "rounded-btn-lg" : "rounded-btn",
        isChip && active ? CHIP_ACTIVE : VARIANTS[variant],
        SIZES[size],
        full && "w-full",
        className,
      )}
      {...props}
    />
  );
}
