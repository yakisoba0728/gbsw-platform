import Link from "next/link";
import { buttonClass } from "./button";

export function Pagination({
  page,
  pageCount,
  href,
  label,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
  label: string;
}) {
  if (pageCount <= 1) return null;

  const items = paginationItems(page, pageCount);
  const step = buttonClass({ variant: "secondary", size: "sm" });
  const pageClass = (active: boolean) =>
    buttonClass({ variant: "chip", size: "page", active });

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-center gap-1.5 border-t border-line px-5 py-3"
    >
      {page <= 1 ? (
        <span aria-disabled="true" className={`${step} opacity-40`}>
          이전
        </span>
      ) : (
        <Link href={href(page - 1)} className={step}>
          이전
        </Link>
      )}

      {items.map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-mut2" aria-hidden>
            …
          </span>
        ) : item === page ? (
          <span key={item} aria-current="page" className={pageClass(true)}>
            {item}
          </span>
        ) : (
          <Link key={item} href={href(item)} className={pageClass(false)}>
            {item}
          </Link>
        ),
      )}

      {page >= pageCount ? (
        <span aria-disabled="true" className={`${step} opacity-40`}>
          다음
        </span>
      ) : (
        <Link href={href(page + 1)} className={step}>
          다음
        </Link>
      )}
    </nav>
  );
}

export function paginationItems(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set([1, pageCount]);
  for (let value = page - 2; value <= page + 2; value += 1) {
    if (value >= 1 && value <= pageCount) pages.add(value);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  for (const value of sorted) {
    const previous = items.at(-1);
    if (typeof previous === "number" && value - previous > 1) items.push("gap");
    items.push(value);
  }
  return items;
}
