import type { ComponentPropsWithoutRef, JSX } from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

const SCHEMA = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(
    (tag) => !["img", "input", "iframe", "object", "embed", "video", "audio"].includes(tag),
  ),
  attributes: {
    ...defaultSchema.attributes,
    a: [["href"], ["title"]],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
  },
};

type Md<T extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<T> &
  ExtraProps;

function omitNode<P extends ExtraProps>({ node, ...rest }: P): Omit<P, "node"> {
  void node;
  return rest;
}

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
    <ul {...omitNode(p)} className={cn("my-3 list-disc space-y-1 pl-5", p.className)} />
  ),
  ol: (p: Md<"ol">) => (
    <ol
      {...omitNode(p)}
      className={cn("my-3 list-decimal space-y-1 pl-5", p.className)}
    />
  ),
  blockquote: (p: Md<"blockquote">) => (
    <blockquote className="my-3 border-l-2 border-line-strong pl-3 text-mut" {...omitNode(p)} />
  ),
  code: (p: Md<"code">) => (
    <code
      {...omitNode(p)}
      className={cn("rounded-btn bg-soft px-1 py-0.5 text-caption", p.className)}
    />
  ),
  pre: (p: Md<"pre">) => (
    <pre
      className="my-3 overflow-x-auto rounded-card border border-line bg-soft p-3 text-caption"
      {...omitNode(p)}
    />
  ),
  hr: () => <hr className="my-5 border-line" />,
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
