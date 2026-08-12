import { headers } from "next/headers";

export type RequestContext = {
  ip: string | null;
  userAgent: string | null;
};

const EMPTY: RequestContext = { ip: null, userAgent: null };

/** 브라우저 UA는 길다. 저장 전에 자른다. */
const MAX_USER_AGENT = 200;

/**
 * 요청의 접속 정보를 읽는다.
 *
 * 별도 함수로 둔 이유: `next/headers`는 요청 컨텍스트 안에서만 동작하므로
 * 부팅 훅·스크립트·테스트에서는 쓸 수 없다. 여기만 대체하면 나머지가 그대로 돈다.
 */
export async function readRequestContext(): Promise<RequestContext> {
  try {
    const h = await headers();

    // 리버스 프록시 뒤에 있으므로 원 IP는 x-forwarded-for 첫 항목이다.
    // 프록시가 없으면 x-real-ip를 쓴다.
    const forwarded = h.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;

    const userAgent = h.get("user-agent")?.slice(0, MAX_USER_AGENT) ?? null;

    return { ip: ip || null, userAgent };
  } catch {
    // 요청 밖에서 호출된 경우 (instrumentation, 스크립트 등)
    return EMPTY;
  }
}
