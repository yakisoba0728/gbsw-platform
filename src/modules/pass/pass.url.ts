/**
 * QR이 가리킬 주소와, 스캔한 글자에서 토큰을 꺼내는 일.
 *
 * 공개 출처는 `BETTER_AUTH_URL`에서 읽는다 — 앱은 127.0.0.1에만 묶이고 공개
 * 주소는 리버스 프록시가 쥐고 있어 요청 헤더로는 알 수 없다. 그 값은 이미
 * 이 시스템의 공개 출처를 정한다(어긋나면 로그아웃이 INVALID_ORIGIN으로 실패한다).
 */

/** 토큰 최대 길이. passId 64 + 점 + 서명 16 + 여유. */
const MAX_TOKEN = 128;

export const SCAN_PATH = "/scan";

export function scanOrigin(): string {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) {
    throw new Error("BETTER_AUTH_URL 환경변수가 없습니다.");
  }
  return new URL(url).origin;
}

export function buildScanUrl(token: string): string {
  return `${scanOrigin()}${SCAN_PATH}?c=${token}`;
}

/**
 * 스캔한 글자에서 토큰을 꺼낸다. **출처를 인자로 받는다** — `buildScanUrl`은
 * `BETTER_AUTH_URL`(서버에만 있는 값)을 직접 읽지만, 이 함수는 브라우저에서도
 * 돌아야 해서 호출부가 출처를 넘긴다. 판독 화면이 서버에서 `scanOrigin()`을
 * 읽어 스캐너 컴포넌트에 prop으로 내려준다.
 *
 * 카메라에 잡히는 QR이 우리 것이라는 보장이 없다 — 학생이 아무 QR이나 들이밀 수
 * 있다. 출처와 경로가 둘 다 맞을 때만 토큰을 꺼내고, **읽은 주소로 이동하지 않는다.**
 */
export function tokenFromScanUrl(text: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  if (url.origin !== origin) return null;
  if (url.pathname !== SCAN_PATH) return null;

  const token = url.searchParams.get("c");
  if (!token || token.length > MAX_TOKEN) return null;
  return token;
}
