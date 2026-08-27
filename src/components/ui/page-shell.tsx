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
 *   page — 기본. 대시보드, 그리고 표가 1000px 안에 드는 화면 (64rem)
 *   wide — 긴 글이 든 열이 있는 표 (80rem)
 *
 * **이 값은 눈대중이 아니라 브라우저에서 잰 것이다.** 표의 max-content 폭을 재
 * 보면 감사로그 1144px · 규정 관리 1174px로 가장 넓고, 나머지는 600~950px에
 * 모인다. 그래서 상한이 80rem(1280px)이다 — 더 늘리면 남는 폭이 카드 안의 빈
 * 자리로만 남는다. 1440px까지만 재던 시절(`docs/design/2026-08-17-responsive-audit.md`)
 * 에는 이 숫자들이 보이지 않았다.
 *
 * **표 자체는 이 폭을 다 쓰지 않는다.** `TableFrame`이 내용만큼만 서고(`w-auto`)
 * 여기 값은 상한으로만 작동한다. 그래서 `wide`를 골라도 짧은 표는 안 늘어난다 —
 * 화면을 고르는 일은 「이 표가 넓어질 수 있는가」를 정하는 것이지 「넓게 그린다」가
 * 아니다.
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
