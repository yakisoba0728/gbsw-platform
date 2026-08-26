/**
 * 값이 같으면 글자도 같은 JSON. 키를 정렬하고 문자열을 NFC로 맞춘다.
 *
 * 두 곳이 이것을 쓴다 — 미리보기 토큰의 HMAC 대상(`roster.preview-token.ts`)과
 * 화면이 「미리보기 이후 내용이 바뀌었나」를 보는 지문(`preview-fingerprint.ts`).
 * **둘의 규칙이 갈리면 서버가 발급한 토큰을 서버가 거부한다.** 한글 자모는 같은
 * 글자를 두 가지 코드로 적을 수 있어(NFC/NFD) 맥에서 만든 파일과 윈도에서 만든
 * 파일이 갈리는데, 정규화를 한쪽만 하면 그 파일에서만 확정이 막힌다.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(null);
}
