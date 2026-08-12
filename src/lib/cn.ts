export type ClassValue = string | false | null | undefined;

/** 조건부 className을 이어붙이는 최소 유틸. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
