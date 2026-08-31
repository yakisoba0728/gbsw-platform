import Link from "next/link";
import type { ReactNode } from "react";
import { TruncatedText } from "@/components/ui/truncated-text";
import { cn } from "@/lib/cn";

/**
 * 대시보드가 쓰는 짧은 목록. **표가 아니다** — 열을 맞춰 훑는 자리가 아니라
 * 「지금 무엇이 있나」를 다섯 줄로 보여주고 제 화면으로 보내는 자리다.
 *
 * 표(`DataTable`)를 여기 넣으면 좁은 칸에서 카드로 접히면서 한 건이 세 줄을
 * 차지한다 — 대시보드의 절반 폭 카드 안에서는 다섯 건이 열다섯 줄이 된다.
 */
export function SummaryList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line2">{children}</ul>;
}

/**
 * 한 줄. 왼쪽은 무엇인지, 오른쪽은 그 상태다.
 *
 * `href`를 주면 줄 전체가 링크가 된다 — 제목만 링크면 누를 자리가 글자 폭만큼
 * 좁고, 폰에서는 그것을 맞히기 어렵다.
 */
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
  /**
   * 잘렸을 때 말풍선에 띄울 제목 전문. 제목이 여러 조각으로 조립되면 그 문자열을
   * 화면 코드에서 다시 만들 수 없으므로 호출부가 준다. 안 주면 제목이 문자열일
   * 때만 말풍선이 선다.
   */
  titleText?: string;
  /** 제목 아래 한 줄 — 학급·시각처럼 그 건을 특정하는 것. */
  meta?: ReactNode;
  /** 위와 같다. 보조 줄의 전문. */
  metaText?: string;
  /** 오른쪽 끝 — 배지·점수. */
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

  const shape = "ui-summary-row flex items-center gap-3 px-5 py-2.5";

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
