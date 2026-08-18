import { headers } from "next/headers";

export type RequestContext = {
  ip: string | null;
  userAgent: string | null;
};

const EMPTY: RequestContext = { ip: null, userAgent: null };

/** 브라우저 UA는 길다. 저장 전에 자른다. */
const MAX_USER_AGENT = 200;

/** 요청의 접속 정보. `next/headers`는 요청 밖에서 못 쓰므로 여기 한 곳에 모은다. */
export async function readRequestContext(): Promise<RequestContext> {
  try {
    const h = await headers();

    // 리버스 프록시 뒤라 원 IP는 x-forwarded-for 첫 항목이다.
    //
    // 이 헤더는 클라이언트가 마음대로 보낼 수 있으므로, **앱이 프록시로만
    // 닿을 때에만** 믿을 수 있다. compose가 앱을 127.0.0.1에 묶고 프록시가
    // 이 헤더를 자기 값으로 덮어쓰는 것이 그 전제다. 앱을 외부에 직접
    // 노출하면 누구나 아무 IP나 감사로그에 심을 수 있다.
    const forwarded = h.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;

    const userAgent = h.get("user-agent")?.slice(0, MAX_USER_AGENT) ?? null;

    return { ip: ip || null, userAgent };
  } catch {
    // 요청 밖에서 호출된 경우 (스크립트 등)
    return EMPTY;
  }
}
