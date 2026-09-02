type ClassValue = string | false | null | undefined;

// 문자열만 이어 붙이며 충돌하는 Tailwind 유틸리티를 정리하지 않는다.
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
