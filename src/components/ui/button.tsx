import type { ComponentPropsWithoutRef } from "react";
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
  // 에메랄드 위 글자는 근검정이다. 흰 글자는 대비가 2:1까지 떨어진다.
  primary: "border-transparent bg-pri text-on-pri hover:bg-pri-press",
  secondary: "border-line-strong bg-surface text-ink hover:bg-soft",
  // 되돌릴 수 있는 파괴적 동작 — 표 한 줄의 취소·삭제·폐기. 흰 바탕이라
  // 화면에서 가장 무거운 것이 되지 않는다.
  danger: "border-rose-line bg-surface text-rose hover:bg-rose-soft",
  // **화면의 주된 동작이 되돌릴 수 없을 때.** primary와 같은 무게를 갖되 색으로
  // 말린다 — 명단 반영의 「확정」이 그 자리다(계정과 기록을 영구히 지운다).
  // 그 버튼이 오래 초록이었고, 같은 카드에 "복원 기능은 없습니다"가 적혀 있었다.
  "danger-solid": "border-transparent bg-rose text-white hover:bg-rose-press",
  ghost: "border-transparent bg-transparent text-ink hover:bg-soft",
  // 앱 셸의 아이콘 버튼(로그아웃·메뉴 열기·닫기). 평소에는 물러나 있다가 손이
  // 닿을 때만 잉크색이 된다 — ghost는 처음부터 잉크색이라 화면 모서리에서
  // 본문만큼 크게 읽힌다. cn()은 tailwind-merge가 아니라 className으로
  // text-ink를 덮을 수 없어서 variant로 가른다.
  quiet: "border-transparent bg-transparent text-mut hover:bg-soft hover:text-ink",
  chip: "border-line bg-surface text-mut hover:bg-soft hover:text-ink",
};

/** 고른 칩. 초록이 아니라 잉크색이다 — 에메랄드는 실행 버튼에만 남긴다. */
const CHIP_ACTIVE = "border-ink bg-ink text-white hover:bg-ink";

/*
 * 모바일에서 36px 미만이면 안 된다 (시안 Touch Targets). 표 안이 빽빽해지는
 * 데스크톱에서만 다시 줄인다 — 마우스에는 36px이 필요 없다.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-caption lg:h-8",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-4 text-sm",
  icon: "size-9 lg:size-8",
  // 쪽 번호. 한 자리든 세 자리든 같은 폭으로 서야 줄이 안 흔들린다. 예전에는
  // 호출부가 `className: "min-w-9 px-2"`로 덮으려 했는데, cn()은 tailwind-merge가
  // 아니라 sm의 px-3이 그대로 남아 둘 중 어느 쪽이 이길지 CSS 순서가 정했다.
  page: "h-9 min-w-9 px-2 text-caption lg:h-8",
};

/**
 * 버튼 생김새만 필요한 곳이 쓴다 — `<Link>`는 `<button>`이 아니라서 Button을
 * 쓸 수 없는데, 클래스를 손으로 베끼면 규격이 갈라진다.
 */
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
    "disabled:pointer-events-none disabled:opacity-40",
    isChip ? "rounded-full" : "rounded-btn",
    isChip && active ? CHIP_ACTIVE : VARIANTS[variant],
    SIZES[size],
    full && "w-full",
    className,
  );
}

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
  return (
    <button
      type={type}
      // 선택 상태를 색으로만 알리지 않는다. {...props}가 뒤에 오므로 호출부가 이긴다.
      aria-pressed={variant === "chip" ? active : undefined}
      className={buttonClass({ variant, size, full, active, className })}
      {...props}
    />
  );
}
