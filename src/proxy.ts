import { NextResponse, type NextRequest } from "next/server";
import {
  PASS_FLASH_COOKIE,
  PASS_FLASH_HEADER,
  verifyPassFlash,
} from "@/modules/pass/pass-flash";

// 입력 헤더를 지우고, 서명된 일회용 쿠키만 /pass 안내 헤더로 전달한다.
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
