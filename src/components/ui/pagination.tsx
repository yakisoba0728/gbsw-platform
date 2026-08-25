import Link from "next/link";
import { buttonClass } from "./button";

/**
 * 쪽 넘기기.
 *
 * 두 화면이 각자 그리고 있었고 생김새가 아예 달랐다 — 최근 부여는 칩으로 된 쪽
 * 번호에 이전/다음 버튼, 감사로그는 밑줄 친 글자 링크에 「3 / 7」 한 줄. 같은 일을
 * 하는 조작부가 화면마다 다른 언어로 서 있었다.
 *
 * **표를 담은 카드의 바닥 띠로 선다.** 카드 밖에 두면 어느 표의 쪽인지 흐려지고,
 * 표 위에 두면 다 읽기도 전에 눈에 먼저 든다.
 */
export function Pagination({
  page,
  pageCount,
  href,
  label,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
  /** `aria-label`. 한 화면에 표가 둘이면 어느 쪽인지 가려야 한다. */
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

/** 첫·끝과 현재 주변 두 페이지만 보여 긴 목록에서도 조작부 폭이 고정된다. */
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
