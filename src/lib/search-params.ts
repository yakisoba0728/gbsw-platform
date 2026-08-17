/** Next의 `searchParams`가 주는 모양 그대로. */
export type SearchParamsInput = Record<string, string | string[] | undefined>;

/**
 * 지금 쿼리를 유지한 채 일부만 바꾼 주소. `patch`의 `null`이 그 키를 지운다.
 * 배열 값(`?a=1&a=2`)은 버린다 — 주소를 손으로 고친 경우뿐이다.
 */
export function hrefWith(
  basePath: string,
  params: SearchParamsInput,
  patch: Record<string, string | null> = {},
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) query.delete(key);
    else query.set(key, value);
  }

  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
