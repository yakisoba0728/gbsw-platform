import { Fragment } from "react";
import { cn } from "@/lib/cn";

/**
 * 평문을 그리는 자리. 줄바꿈을 살리고 **주소만 링크로 만든다.**
 *
 * 마크다운도 서식 편집기도 넣지 않는다는 결정은 그대로다 — 여기서 하는 일은
 * 사용자가 친 글자를 해석하는 것이 아니라, 이미 주소인 것을 누를 수 있게 하는
 * 것뿐이다. **HTML을 만들지 않으므로 살균할 것도 없다**: 아래 `split`이 글을
 * 조각으로 나누고 React가 각 조각을 텍스트 노드로 그린다. `<a>`에 들어가는 것은
 * 정규식이 `http://`·`https://`로 시작한다고 확인한 문자열뿐이다.
 */

/**
 * 주소로 볼 것. 스킴을 `http`·`https`로 못 박는다 — `javascript:`가 href에
 * 닿을 길을 정규식 단계에서 없앤다.
 *
 * 공백과 따옴표·꺾쇠에서 끊는다. 뒤에 붙은 문장부호는 아래에서 떼어낸다.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/g;

/**
 * 주소 끝에 붙기 쉬운 문장부호. 「…자세한 것은 https://a.kr/b 를 보세요.」에서
 * 마지막 점까지 링크로 먹으면 눌렀을 때 404가 난다.
 */
const TRAILING = /[.,;:!?]+$/;

type Segment = { text: string; href: string | null };

/**
 * 글을 「그냥 글」과 「주소」 조각으로 나눈다. 순수 함수라 테스트가 쉽다.
 *
 * 괄호를 세는 이유: 「(https://a.kr/b)」처럼 감싸 쓰면 닫는 괄호가 주소에 딸려
 * 들어간다. 주소 안에 열린 괄호가 없다면 닫는 괄호는 주소의 것이 아니다.
 */
export function splitLinks(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    let url = match[0];

    // 뒤에 붙은 문장부호를 떼어낸다.
    url = url.replace(TRAILING, "");
    // 짝이 안 맞는 닫는 괄호도 뗀다.
    while (url.endsWith(")") && countOf(url, ")") > countOf(url, "(")) {
      url = url.slice(0, -1);
    }

    // 스킴만 남은 것(`https://`)은 주소가 아니다.
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

/**
 * 줄바꿈을 살리는 평문 문단. 주소는 새 탭에서 연다.
 *
 * `rel`에 셋을 다 넣는다 — `noopener`가 없으면 열린 쪽이 `window.opener`로 이
 * 창을 조작할 수 있고, `noreferrer`가 없으면 학교 시스템 주소가 바깥으로 새고,
 * `nofollow`는 게시판이 검색 순위를 파는 자리가 되지 않게 한다.
 */
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
