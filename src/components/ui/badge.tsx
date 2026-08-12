import { cn } from "@/lib/cn";

/**
 * 시안의 Badge 컴포넌트. tone 값이 도메인 상태와 1:1로 붙어 있다.
 * (Badge.dc.html의 map과 동일)
 */
export type BadgeTone =
  | "merit"
  | "demerit"
  | "approved"
  | "pending"
  | "rejected"
  | "cancelled"
  | "read"
  | "unread"
  | "info"
  | "neutral";

const TONES: Record<BadgeTone, string> = {
  merit: "bg-blue-soft text-blue",
  demerit: "bg-rose-soft text-rose",
  approved: "bg-green-soft text-green",
  pending: "bg-amber-soft text-amber-ink",
  rejected: "bg-rose-soft text-rose",
  cancelled: "bg-mut-soft text-mut",
  read: "bg-mut-soft text-mut2",
  unread: "bg-pri-soft text-pri",
  info: "bg-pri-soft text-pri",
  neutral: "bg-mut-soft text-mut",
};

/** 시안에서 점 표시가 켜져 있는 tone */
const WITH_DOT: ReadonlySet<BadgeTone> = new Set(["pending", "unread"]);

export function Badge({
  tone = "neutral",
  children,
  dot,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  /** 기본값은 tone에 따라 결정된다. 명시하면 그 값을 따른다. */
  dot?: boolean;
  className?: string;
}) {
  const showDot = dot ?? WITH_DOT.has(tone);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full px-[9px] py-1",
        "text-[10px] leading-none font-bold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {showDot && (
        <span className="size-[5px] rounded-full bg-current" aria-hidden />
      )}
      {children}
    </span>
  );
}
