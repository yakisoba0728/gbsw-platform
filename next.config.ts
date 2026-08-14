import type { NextConfig } from "next";

/**
 * 보안 헤더 (I6).
 *
 * script-src에 nonce를 도입하지 않았다 — Next가 하이드레이션에 쓰는 인라인
 * 스크립트·__NEXT_DATA__를 nonce 없이 엄격히 잠그면 앱 전체가 깨진다. 그래서
 * `'unsafe-inline'`을 둔다: XSS를 인라인 스크립트 실행까지 막지는 못하지만,
 * 그래도 외부 출처에서 스크립트·스타일을 끌어오는 것과 프레임에 끼워 넣는 것,
 * form 제출 대상을 다른 origin으로 바꾸는 것, base 태그로 상대경로를 가로채는
 * 것은 막는다. nonce 기반으로 좁히는 건 별도 작업으로 남겨둔다.
 *
 * connect-src 'self'에는 Next dev의 HMR 웹소켓(같은 origin)도 포함된다 —
 * 스킴만 ws/wss로 바뀔 뿐 host:port가 페이지와 같으면 'self'로 통과한다.
 *
 * script-src에 개발 모드에서만 'unsafe-eval'을 더한다 — React 개발 모드가
 * 콜스택을 재구성하는 디버그 기능에 eval()을 쓴다(React 자신이 "production
 * 모드에서는 절대 eval을 쓰지 않는다"고 명시한다). 브라우저로 직접 띄워
 * 확인했다: 이게 없으면 콘솔에 eval 관련 오류가 나고, 운영 빌드에는 이 조건이
 * 아예 안 들어간다.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
  }`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // 리버스 프록시 뒤 HTTPS 배포를 전제로 한다 (docker-compose.yml의
  // BETTER_AUTH_URL이 https://를 강제한다). http로만 열리는 로컬 개발에서는
  // 브라우저가 이 헤더 자체를 무시하므로 안전하게 둘 수 있다.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  // 부트스트랩 토큰이 URL 쿼리에 실린다(instrumentation.ts) — 어떤 외부 링크를
  // 통해서도, 같은 출처 안에서도 Referer로 새어나가지 않게 아예 안 보낸다.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  // Docker 멀티스테이지 빌드에서 최소 런타임 이미지를 만들기 위해 필요.
  output: "standalone",
  // 응답에서 X-Powered-By: Next.js를 뺀다 — 서버 기술 스택을 광고하지 않는다.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
