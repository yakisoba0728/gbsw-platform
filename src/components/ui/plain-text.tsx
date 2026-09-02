import { Fragment } from "react";
import { cn } from "@/lib/cn";

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/g;

const TRAILING = /[.,;:!?]+$/;

type Segment = { text: string; href: string | null };

export function splitLinks(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    let url = match[0];

    url = url.replace(TRAILING, "");
    while (url.endsWith(")") && countOf(url, ")") > countOf(url, "(")) {
      url = url.slice(0, -1);
    }

    if (!/^https?:\/\/[^/]/.test(url)) continue;

    if (start > last) segments.push({ text: text.slice(last, start), href: null });
    segments.push({ text: url, href: url });
    last = start + url.length;
  }

  if (last < text.length) segments.push({ text: text.slice(last), href: null });
  return segments;
}

function countOf(value: string, char: string): number {
  let n = 0;
  for (const c of value) if (c === char) n += 1;
  return n;
}

export function PlainText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {splitLinks(children).map((segment, i) => (
        <Fragment key={i}>
          {segment.href === null ? (
            segment.text
          ) : (
            <a
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-pri-ink underline decoration-line-strong underline-offset-2 hover:decoration-current"
            >
              {segment.text}
            </a>
          )}
        </Fragment>
      ))}
    </p>
  );
}
