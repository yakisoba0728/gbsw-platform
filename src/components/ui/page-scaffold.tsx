import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PageHeader } from "./page-header";

export type PageScaffoldWidth =
  | "compact"
  | "form"
  | "standard"
  | "data"
  | "full";

const WIDTHS: Record<PageScaffoldWidth, string> = {
  compact: "max-w-xl",
  form: "max-w-3xl",
  standard: "max-w-6xl",
  data: "max-w-[86rem]",
  full: "max-w-none",
};

/**
 * 업무 페이지의 폭·제목 계층·동작 배치·세로 리듬을 한 seam에서 관리한다.
 * 화면은 업무 데이터와 섹션만 넘기고 viewport별 골격은 이 모듈 뒤에 숨긴다.
 */
export function PageScaffold({
  eyebrow,
  title,
  description,
  actions,
  tabs,
  width = "standard",
  className,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  width?: PageScaffoldWidth;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "ui-page-scaffold mx-auto w-full space-y-5 lg:space-y-6",
        WIDTHS[width],
        className,
      )}
    >
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
        tabs={tabs}
        className="mb-0"
      />
      {children}
    </div>
  );
}
