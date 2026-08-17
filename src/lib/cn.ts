export type ClassValue = string | false | null | undefined;

/**
 * className을 이어붙이는 최소 유틸. **tailwind-merge가 아니라 충돌을 해소하지
 * 않는다** — 프리미티브의 기본 클래스를 덮으려는 시도는 조용히 무시되므로,
 * 폭·여백을 바꿔야 하면 바깥 요소에 준다.
 */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
