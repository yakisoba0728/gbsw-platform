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

/**
 * chip variant는 선택 상태를 별도로 그린다.
 *
 * 링크로 된 필터 칩(`ui/chip-link.tsx`)이 이 규격을 그대로 따라간다 —
 * 두 가지가 화면에서 나란히 서기 때문이다(규정 화면의 종류 칩은 링크,
 * 초대 화면의 상태 칩은 버튼인데 사용자에겐 똑같은 알약이다).
 */
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
      /*
       * 선택 상태를 색으로만 알리지 않는다. chip은 전부 "켰다/껐다"를 나타내는
       * 자리라 8덩어리(초대·사용자·로그·학생 표의 필터)가 여기 한 줄로 해결된다.
       *
       * 초대 발급 화면의 학생/관리자/학부모 셋만 성격이 다르다 — 필터가 아니라
       * 아래 폼을 갈아 끼우는 탭이다. 그래도 aria-pressed를 붙인다: 지금 그
       * 화면은 선택 상태를 색으로만 전달하고 있고, 제대로 된 탭으로 만들려면
       * role="tab"·tabpanel·화살표키 이동까지 필요해 이 파일 한 곳에서 끝나지
       * 않는다. "눌려 있다"는 사실이라도 전달되는 편이 아무것도 없는 것보다 낫다.
       *
       * {...props}가 뒤에 오므로 호출부가 명시하면 그쪽이 이긴다.
       */
      aria-pressed={isChip ? active : undefined}
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
