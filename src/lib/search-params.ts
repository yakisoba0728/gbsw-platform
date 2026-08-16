/**
 * 지금 쿼리를 유지한 채 일부만 바꾼 주소.
 *
 * **왜 한 곳에 모으는가.** 화면 여덟 곳이 각자 `new URLSearchParams()` +
 * `Object.entries(params)` + `typeof value === "string"` 필터를 다시 적고 있었다.
 * 뼈대는 같은데 "어떤 키를 지우는가"만 달라서, 규칙이 어긋나도 한 화면에서만
 * 티가 났다 — 예컨대 반을 고른 채 트랙 탭을 누르면 그 반이 유지되어야 하는데,
 * 한 곳이라도 params 보존을 빠뜨리면 그 화면에서만 반이 풀린다.
 *
 * 지우기는 `drop` 같은 별도 인자가 아니라 **patch의 `null`**로 표현한다.
 * "기숙사 탭으로 옮기면서 year를 버린다"는 `{ track: "DORM", year: null }`
 * 한 줄이고, 여덟 호출부의 차이가 전부 이 한 가지 수단으로 표현된다.
 */

/** Next의 `searchParams`가 주는 모양 그대로. */
export type SearchParamsInput = Record<string, string | string[] | undefined>;

/**
 * @param basePath 물음표 앞 경로 (`/merit`, `/merit/students/<id>` …)
 * @param params   보존할 현재 쿼리
 * @param patch    덮어쓸 값. `null`이면 그 키를 지운다.
 *
 * 배열 값(`?track=A&track=B`)은 버린다. 이 앱의 화면 중 같은 키를 여러 번 받는
 * 곳이 없고, 여덟 개의 원본 구현이 전부 같은 판단을 하고 있었다 — 배열이
 * 들어오는 건 주소를 손으로 고친 경우뿐이라 기본값으로 떨어뜨리는 게 맞다.
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
