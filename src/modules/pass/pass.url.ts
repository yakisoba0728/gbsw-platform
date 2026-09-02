
const MAX_TOKEN = 128;

const SCAN_PATH = "/scan";

export function scanOrigin(): string {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) {
    throw new Error("BETTER_AUTH_URL 환경변수가 없습니다.");
  }
  return new URL(url).origin;
}

export function buildScanUrl(code: string): string {
  return `${scanOrigin()}${SCAN_PATH}?c=${code}`;
}

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
