import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 보는 방식을 바꾸는 줄 — 「개요 / 순위 / 교사별 / 규정별」, 「교내 / 기숙사」.
 *
 * **필터 칩(`Button variant="chip"`)과 일부러 다르게 생겼다.** 둘은 하는 일이
 * 다르다. 칩은 목록을 좁히고(끄면 다시 넓어진다), 이것은 같은 자료를 다른 각도로
 * 보여준다(늘 하나가 켜져 있고 끌 수 없다). 예전에는 둘 다 알약이라, 한 화면에
 * 검은 알약 줄과 흰 알약 줄이 나란히 서서 무엇이 무엇인지 모양으로 알 수 없었다.
 *
 * 켜진 칸은 눌린 바탕(`bg-track`) 위에 흰 조각으로 떠오른다 — 색이 아니라 높이로
 * 알린다. 화면에서 에메랄드는 실행 버튼 몫이고, 검정은 필터 칩 몫이다.
 */
export function Segmented({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "ui-segmented inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-btn border border-line bg-track p-0.5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** 칸 하나의 생김새. `<Link>`와 `<button>`이 같은 것을 쓴다. */
export function segmentClass(active: boolean, className?: string): string {
  return cn(
    "ui-segment inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border px-3",
    "text-caption font-medium whitespace-nowrap transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
    active
      ? "border-line bg-surface text-ink"
      : "border-transparent text-mut hover:text-ink",
    className,
  );
}

/** 주소로 갈리는 칸. `aria-current`가 켜진 곳을 알린다 — 색만으로 알리지 않는다. */
export function SegmentLink({
  href,
  active,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "href" | "className"> & {
  href: string;
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={segmentClass(active, className)}
      {...props}
    >
      {children}
    </Link>
  );
}

/** 상태로 갈리는 칸. */
export function SegmentButton({
  active,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={segmentClass(active, className)}
      {...props}
    />
  );
}
