import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "danger-solid"
  | "ghost"
  | "quiet"
  | "chip";

export type ButtonSize = "sm" | "md" | "lg" | "icon" | "page";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-pri text-on-pri hover:bg-pri-press",
  secondary: "border-line-strong bg-surface text-ink hover:bg-soft",
  danger: "border-rose-line bg-surface text-rose hover:bg-rose-soft",
  "danger-solid": "border-transparent bg-rose text-white hover:bg-rose-press",
  ghost: "border-transparent bg-transparent text-ink hover:bg-soft",
  quiet: "border-transparent bg-transparent text-mut hover:bg-soft hover:text-ink",
  chip: "border-line bg-surface text-mut hover:bg-soft hover:text-ink",
};

const CHIP_ACTIVE = "border-ink bg-ink text-white hover:bg-ink";

const SOLID_DISABLED =
  "disabled:border-line disabled:bg-mut-soft disabled:text-mut2";
const FADE_DISABLED = "disabled:opacity-40";

const DISABLED: Record<ButtonVariant, string> = {
  primary: SOLID_DISABLED,
  "danger-solid": SOLID_DISABLED,
  secondary: FADE_DISABLED,
  danger: FADE_DISABLED,
  ghost: FADE_DISABLED,
  quiet: FADE_DISABLED,
  chip: FADE_DISABLED,
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-caption lg:h-8",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-4 text-sm",
  icon: "size-9 lg:size-8",
  page: "h-9 min-w-9 px-2 text-caption lg:h-8",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  full = false,
  active = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  active?: boolean;
  className?: string;
} = {}): string {
  const isChip = variant === "chip";

  return cn(
    "inline-flex items-center justify-center gap-1.5 border font-medium leading-none whitespace-nowrap",
    "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
    "disabled:pointer-events-none",
    isChip ? "rounded-full" : "rounded-btn",
    isChip && active ? CHIP_ACTIVE : VARIANTS[variant],
    DISABLED[variant],
    SIZES[size],
    full && "w-full",
    className,
  );
}

type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
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
  return (
    <button
      type={type}
      aria-pressed={variant === "chip" ? active : undefined}
      className={buttonClass({ variant, size, full, active, className })}
      {...props}
    />
  );
}
