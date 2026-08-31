import type { APIResponse } from "@playwright/test";

export type RedirectObservation = Readonly<{
  httpStatus: number;
  contractStatus: 307 | 308 | null;
  location: string | null;
  mechanism: "http" | "next-stream-meta" | "none";
}>;

function decodeHtmlAttribute(value: string): string {
  const entities: Readonly<Record<string, string>> = {
    amp: "&",
    quot: '"',
    "#39": "'",
    "#x27": "'",
    lt: "<",
    gt: ">",
  };
  return value.replace(
    /&(amp|quot|#39|#x27|lt|gt);/gi,
    (entity, name: string) => {
      return entities[name.toLowerCase()] || entity;
    },
  );
}

/**
 * App Router가 정적 shell을 먼저 stream하면 HTTP status를 바꿀 수 없어
 * redirect/permanentRedirect를 이 meta tag로 보낸다. 현재 Next의 1초/0초 값은
 * 각각 temporary/permanent 의미다.
 */
export function parseNextStreamedRedirect(
  html: string,
): Pick<
  RedirectObservation,
  "contractStatus" | "location" | "mechanism"
> | null {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((value) => /\bid=(["'])__next-page-redirect\1/i.test(value));
  if (!tag) return null;

  const content = tag.match(/\bcontent=(["'])(.*?)\1/i)?.[2];
  if (!content) return null;
  const decoded = decodeHtmlAttribute(content);
  const match = decoded.match(/^(0|1);url=([\s\S]+)$/);
  if (!match) return null;

  return {
    contractStatus: match[1] === "0" ? 308 : 307,
    location: match[2],
    mechanism: "next-stream-meta",
  };
}

export async function readRedirectObservation(
  response: APIResponse,
): Promise<RedirectObservation> {
  const httpStatus = response.status();
  if (httpStatus === 307 || httpStatus === 308) {
    return {
      httpStatus,
      contractStatus: httpStatus,
      location: response.headers().location || null,
      mechanism: "http",
    };
  }

  if (httpStatus === 200) {
    const streamed = parseNextStreamedRedirect(await response.text());
    if (streamed) return { httpStatus, ...streamed };
  }

  return {
    httpStatus,
    contractStatus: null,
    location: response.headers().location || null,
    mechanism: "none",
  };
}
