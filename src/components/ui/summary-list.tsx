import Link from "next/link";
import type { ReactNode } from "react";
import { TruncatedText } from "@/components/ui/truncated-text";
import { cn } from "@/lib/cn";

export function SummaryList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line2">{children}</ul>;
}

export function SummaryRow({
  href,
  title,
  titleText,
  meta,
  metaText,
  trailing,
}: {
  href?: string;
  title: ReactNode;
  titleText?: string;
  meta?: ReactNode;
  metaText?: string;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <TruncatedText
          full={titleText ?? (typeof title === "string" ? title : "")}
          className="text-sm text-ink"
        >
          {title}
        </TruncatedText>
        {meta && (
          <TruncatedText
            full={metaText ?? (typeof meta === "string" ? meta : "")}
            className="mt-0.5 text-xs text-mut"
          >
            {meta}
          </TruncatedText>
        )}
      </div>
      {trailing && (
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      )}
    </>
  );

  const shape = "flex items-center gap-3 px-5 py-2.5";

  return (
    <li>
      {href ? (
        <Link href={href} className={cn(shape, "transition-colors hover:bg-soft")}>
          {body}
        </Link>
      ) : (
        <div className={shape}>{body}</div>
      )}
    </li>
  );
}
