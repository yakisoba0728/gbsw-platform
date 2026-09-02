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

    // 앱은 127.0.0.1 뒤의 프록시 한 홉에서만 요청을 받는다. 따라서 목록의 마지막
    // 항목이 프록시가 실제로 본 상대이고, 첫 항목은 클라이언트가 지어낼 수 있다.
    //
    // 마지막 항목 읽기는 덧붙임 오설정에 대한 둘째 방어선일 뿐이다. 프록시가
    // 헤더를 아예 손대지 않고 넘기면 위조한 단일 값을 코드로 구분할 수 없으므로,
    // compose의 루프백 바인딩과 프록시의 덮어쓰기는 여전히 필수다.
    // X-Forwarded-Proto는 접속 IP 홉 목록이 아니라 원 요청의 scheme을 전하는
    // 별도 헤더이므로 이 규칙의 대상이 아니다.
    const forwarded = h.get("x-forwarded-for");
    const hops = forwarded?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
    const ip =
      hops[hops.length - 1] || h.get("x-real-ip")?.trim() || null;

    const userAgent = h.get("user-agent")?.slice(0, MAX_USER_AGENT) ?? null;

    return { ip: ip || null, userAgent };
  } catch {
    // 요청 밖에서 호출된 경우 (스크립트 등)
    return EMPTY;
  }
}
