import { NextResponse, type NextRequest } from "next/server";
import {
  PASS_FLASH_COOKIE,
  PASS_FLASH_HEADER,
  verifyPassFlash,
} from "@/modules/pass/pass-flash";

/**
 * `/pass` 성공 안내를 한 요청에만 전달한다. 브라우저가 보낸 같은 이름의 헤더는
 * 먼저 지우고, 서버 서명이 유효한 HttpOnly 쿠키만 내부 요청 헤더로 승격한다.
 */
export function proxy(request: NextRequest) {
  if (request.method !== "GET" || request.nextUrl.pathname !== "/pass") {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(PASS_FLASH_HEADER);

  const token = request.cookies.get(PASS_FLASH_COOKIE)?.value;
  if (token && verifyPassFlash(token)) requestHeaders.set(PASS_FLASH_HEADER, token);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (token) {
    response.cookies.set(PASS_FLASH_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/pass",
      maxAge: 0,
    });
  }
  return response;
}

export const config = {
  matcher: "/pass/:path*",
};
