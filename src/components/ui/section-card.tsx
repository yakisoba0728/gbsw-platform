import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { cardClass } from "./card";

export function SectionCard({
  title,
  hint,
  aside,
  controls,
  headingLevel = 2,
  flush = false,
  variant = "section",
  tone = "default",
  className,
  children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  aside?: ReactNode;
  controls?: ReactNode;
  headingLevel?: 2 | 3;
  flush?: boolean;
  variant?: "section" | "panel";
  tone?: "default" | "danger";
  className?: string;
  children?: ReactNode;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const danger = tone === "danger";
  const edge = danger ? "border-rose-line" : undefined;
  const heading = cn("text-lg font-semibold", danger ? "text-rose" : "text-ink");

  if (variant === "panel") {
    return (
      <section className={cardClass("panel", cn(edge, className))}>
        <div
          className={
            aside ? "flex flex-wrap items-start justify-between gap-3" : undefined
          }
        >
          <div className="min-w-0">
            <Heading className={heading}>{title}</Heading>
            {hint && <p className="mt-1 text-caption text-mut">{hint}</p>}
          </div>
          {aside}
        </div>
        {controls}
        {children != null && children !== false && (
          <div className="mt-4">{children}</div>
        )}
      </section>
    );
  }

  return (
    <section className={cardClass("flush", cn(edge, className))}>
      <header className={cn("border-b px-5 py-4", danger ? "border-rose-line" : "border-line")}>
        <div
          className={
            aside ? "flex flex-wrap items-center justify-between gap-3" : undefined
          }
        >
          <div className="min-w-0">
            <Heading className={heading}>{title}</Heading>
            {hint && <p className="mt-1 text-caption text-mut">{hint}</p>}
          </div>
          {aside}
        </div>
        {controls}
      </header>

      {flush ? children : <div className="px-5 py-4">{children}</div>}
    </section>
  );
}
