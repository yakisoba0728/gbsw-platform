import type { ComponentPropsWithoutRef, JSX } from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

/**
 * 마크다운 본문.
 *
 * 처음 설계는 「마크다운도 서식 편집기도 없다」였고, 그 근거는 **서식을 넣는
 * 순간 HTML 살균이 이 모듈에서 가장 위험한 코드가 된다**는 것이었다. 그 위험은
 * 사라지지 않았으므로, 여기서는 살균을 두 겹으로 세운다.
 *
 *   ① **날 HTML을 애초에 파싱하지 않는다.** `rehype-raw`를 쓰지 않으므로
 *      `<script>`는 마크다운 문법이 아닌 그냥 글자로 남는다. 이것이 첫째이자
 *      가장 중요한 방어다 — 살균기가 뚫려도 통과시킬 HTML 자체가 없다.
 *   ② **허용 목록으로 한 번 더 거른다** (`rehype-sanitize`). ①이 언젠가
 *      `rehype-raw`와 함께 쓰이게 되더라도 이 그물이 남는다.
 *
 * 주소는 `react-markdown`이 기본으로 안전하지 않은 스킴을 막고
 * (`javascript:`·`data:`), 아래에서 `http`·`https`만 다시 확인한다.
 */

/**
 * 그릴 수 있는 태그. 기본 목록에서 **뺀 것**이 요점이다 —
 * `input`(체크박스 목록), `img`, 그리고 기본에 없는 `iframe`·`object` 계열.
 *
 * 이미지를 뺀 이유: 마크다운으로 아무 주소나 걸 수 있게 되면 게시판이 바깥
 * 서버에 조회를 보내는 자리가 된다(전역 CSP의 `img-src 'self'`가 실제 로딩은
 * 막지만, 애초에 시도하지 않는 편이 낫다). 사진은 첨부로 올리면 글에 그려진다.
 */
const SCHEMA = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(
    (tag) => !["img", "input", "iframe", "object", "embed", "video", "audio"].includes(tag),
  ),
  attributes: {
    ...defaultSchema.attributes,
    // 링크에 허용할 속성. `target`·`rel`은 아래 컴포넌트가 직접 붙인다.
    a: [["href"], ["title"]],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
  },
};

/**
 * react-markdown이 넘기는 props. `ExtraProps`의 `node`를 **DOM에 그대로 뿌리면
 * `node="[object Object]"`가 모든 태그에 붙는다** — 실제로 그랬다. 아래 모든
 * 컴포넌트가 구조분해로 그것을 떼어낸다.
 */
type Md<T extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<T> &
  ExtraProps;

/**
 * `node`를 뗀 나머지 props. react-markdown이 넘기는 그 값을 **DOM에 그대로
 * 뿌리면 `node="[object Object]"`가 모든 태그에 붙는다** — 실제로 그랬다.
 *
 * 컴포넌트마다 구조분해로 버리면 같은 줄이 열여섯 번 반복되고 lint에도 걸린다.
 * 한곳에 모은다.
 */
function omitNode<P extends ExtraProps>({ node, ...rest }: P): Omit<P, "node"> {
  void node;
  return rest;
}

/**
 * 게시판 본문의 마크다운 규격.
 *
 * **제목은 `h3`부터 시작한다** — 페이지에 이미 `<h1>`(상단바)과 `<h2>`(글 제목)가
 * 있어서, 본문의 `#`이 `h1`이 되면 문서 구조가 뒤집힌다.
 */
const COMPONENTS = {
  h1: (p: Md<"h1">) => (
    <h3 className="mt-6 mb-2 text-lg font-semibold text-ink first:mt-0" {...omitNode(p)} />
  ),
  h2: (p: Md<"h2">) => (
    <h4 className="mt-5 mb-2 text-base font-semibold text-ink first:mt-0" {...omitNode(p)} />
  ),
  h3: (p: Md<"h3">) => (
    <h5 className="mt-4 mb-1.5 text-base font-medium text-ink first:mt-0" {...omitNode(p)} />
  ),
  h4: (p: Md<"h4">) => (
    <h6 className="mt-4 mb-1.5 text-sm font-medium text-ink first:mt-0" {...omitNode(p)} />
  ),
  h5: (p: Md<"h5">) => (
    <h6 className="mt-4 mb-1.5 text-sm font-medium text-ink first:mt-0" {...omitNode(p)} />
  ),
  h6: (p: Md<"h6">) => (
    <h6 className="mt-4 mb-1.5 text-sm font-medium text-ink first:mt-0" {...omitNode(p)} />
  ),
  p: (p: Md<"p">) => <p className="my-3 first:mt-0 last:mb-0" {...omitNode(p)} />,
  ul: (p: Md<"ul">) => (
    <ul className="my-3 list-disc space-y-1 pl-5" {...omitNode(p)} />
  ),
  ol: (p: Md<"ol">) => (
    <ol className="my-3 list-decimal space-y-1 pl-5" {...omitNode(p)} />
  ),
  blockquote: (p: Md<"blockquote">) => (
    <blockquote className="my-3 border-l-2 border-line-strong pl-3 text-mut" {...omitNode(p)} />
  ),
  code: (p: Md<"code">) => (
    <code className="rounded-btn bg-soft px-1 py-0.5 text-caption" {...omitNode(p)} />
  ),
  // 긴 줄이 카드를 밀지 않게 자기 상자 안에서 가로로 구른다.
  pre: (p: Md<"pre">) => (
    <pre
      className="my-3 overflow-x-auto rounded-card border border-line bg-soft p-3 text-caption"
      {...omitNode(p)}
    />
  ),
  hr: () => <hr className="my-5 border-line" />,
  // 표는 넘칠 수 있어 감싼다 — 페이지 자체가 가로로 구르면 안 된다.
  table: (p: Md<"table">) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full text-left text-sm" {...omitNode(p)} />
    </div>
  ),
  th: (p: Md<"th">) => (
    <th className="border-b border-line px-2 py-1.5 font-medium text-mut" {...omitNode(p)} />
  ),
  td: (p: Md<"td">) => (
    <td className="border-b border-line2 px-2 py-1.5" {...omitNode(p)} />
  ),
  a: ({ href, children }: Md<"a">) => (
    <a
      // 살균기가 이미 스킴을 걸렀지만 여기서 한 번 더 본다 — 이 파일만 읽어도
      // 「href에 무엇이 들어갈 수 있나」의 답이 보여야 한다.
      href={href && /^(https?:|mailto:)/i.test(href) ? href : undefined}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-pri-ink underline decoration-line-strong underline-offset-2 hover:decoration-current"
    >
      {children}
    </a>
  ),
};

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, SCHEMA]]}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
