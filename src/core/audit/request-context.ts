import { headers } from "next/headers";

type RequestContext = {
  ip: string | null;
  userAgent: string | null;
};

const EMPTY: RequestContext = { ip: null, userAgent: null };

const MAX_USER_AGENT = 200;

export async function readRequestContext(): Promise<RequestContext> {
  try {
    const h = await headers();

    // 신뢰하는 단일 프록시가 추가한 마지막 홉만 사용한다.
    const forwarded = h.get("x-forwarded-for");
    const hops = forwarded?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
    const ip =
      hops[hops.length - 1] || h.get("x-real-ip")?.trim() || null;

    const userAgent = h.get("user-agent")?.slice(0, MAX_USER_AGENT) ?? null;

    return { ip: ip || null, userAgent };
  } catch {
    // 시드·테스트처럼 HTTP 요청 밖에서도 감사 기록을 남긴다.
    return EMPTY;
  }
}
