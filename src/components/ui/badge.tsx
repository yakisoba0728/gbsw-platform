import { cn } from "@/lib/cn";

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

/** 옅은 바탕 + 같은 계열 테두리 + 진한 글자. 세 겹이라 색맹에게도 형태가 남는다. */
const TONES: Record<BadgeTone, string> = {
  merit: "border-blue-line bg-blue-soft text-blue",
  demerit: "border-rose-line bg-rose-soft text-rose",
  approved: "border-green-line bg-green-soft text-green",
  pending: "border-amber-line bg-amber-soft text-amber-ink",
  rejected: "border-rose-line bg-rose-soft text-rose",
  cancelled: "border-line bg-mut-soft text-mut",
  read: "border-line bg-mut-soft text-mut2",
  unread: "border-pri-line bg-pri-soft text-pri-ink",
  info: "border-pri-line bg-pri-soft text-pri-ink",
  neutral: "border-line bg-mut-soft text-mut",
};

const WITH_DOT: ReadonlySet<BadgeTone> = new Set(["pending", "unread"]);

export function Badge({
  tone = "neutral",
  children,
  dot,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  /** 기본값은 tone이 정한다. 명시하면 그 값을 따른다. */
  dot?: boolean;
  className?: string;
}) {
  const showDot = dot ?? WITH_DOT.has(tone);

  return (
    <span
      className={cn(
        "ui-badge inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
        "text-xs leading-none font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {showDot && (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      )}
      {children}
    </span>
  );
}
