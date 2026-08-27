import { cn } from "@/lib/cn";

/**
 * 페이지 본문의 폭.
 *
 * 화면마다 `max-w-*`를 손으로 적으면 값이 갈린다 — 실제로 2xl·3xl·4xl·5xl·6xl·7xl
 * 여섯 가지가 스무 곳에 흩어져 있었고, 화면마다 짝이 되는 `loading.tsx`가 그 값을
 * 한 번 더 적고 있었다. 둘이 어긋나면 뼈대에서 내용으로 넘어갈 때 폭이 튄다.
 * `cardClass()`가 카드 껍데기를 소유하는 것과 같은 이유로 여기 하나만 소유한다.
 *
 * 폭은 세 가지뿐이다:
 *   form — 폼·단건 상세. 한 줄이 길어지면 읽기 나빠지는 글이 본문인 화면 (48rem)
 *   page — 기본. 대시보드처럼 카드가 격자로 서는 화면 (64rem)
 *   wide — 표가 본문인 화면 (100rem)
 *
 * **wide가 넓은 이유:** 표는 열이 정해져 있어 좁히면 글자가 다음 줄로 접힌다.
 * 1440px까지만 재던 시절(`docs/design/2026-08-17-responsive-audit.md`)에는 안 보였고,
 * 그보다 넓은 화면에서 「양옆은 비었는데 항목 이름만 두 줄」이 된다.
 * 100rem에서 멈추는 것은 그 위로도 늘리면 눈이 표의 왼쪽 끝과 오른쪽 끝을
 * 오가는 거리가 읽기를 방해하기 때문이다.
 */
export type PageWidth = "form" | "page" | "wide";

const WIDTHS: Record<PageWidth, string> = {
  form: "max-w-page-form",
  page: "max-w-page",
  wide: "max-w-page-wide",
};

export function pageClass(width: PageWidth = "page", className?: string): string {
  return cn("mx-auto w-full", WIDTHS[width], className);
}
