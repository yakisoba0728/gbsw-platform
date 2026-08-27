import { NextResponse } from "next/server";
import { getSessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { getDownload } from "@/modules/community/attachment.service";
import { CommunityError } from "@/modules/community/community.error";
import { contentDisposition } from "@/modules/community/community.storage";

/**
 * 첨부 내려받기. 권한이 붙은 자료라 정적 파일로 서빙하지 않는다 —
 * 세션과 게시판 읽기 권한을 확인한 뒤에만 바이트가 나간다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  // 업로드 라우트와 같은 문이다 — mustChangePassword까지 본다.
  const actor = await getSessionUser();
  if (!actor || actor.status !== "ACTIVE" || actor.deletedAt || actor.mustChangePassword) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { attachmentId } = await params;

  try {
    const file = await getDownload(actor, attachmentId);

    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": contentDisposition(file.filename, file.inline),
        // 브라우저가 타입을 추측해 실행하지 않게.
        "X-Content-Type-Options": "nosniff",
        // 허용 목록이 뚫려 HTML이 흘러도 아무것도 못 하게. 이 응답에만 건다 —
        // next.config.ts의 전역 CSP는 페이지용이라 여기서 덮어쓴다.
        "Content-Security-Policy": "default-src 'none'; sandbox",
        // 권한이 붙은 자료라 프록시가 들고 있으면 안 된다.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    // 권한이 없는 것과 없는 것을 가르지 않는다 — 가르면 첨부 id를 훑어
    // "존재하는 id"를 알아낼 수 있다.
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }
    if (error instanceof CommunityError) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }
    // 행은 있는데 디스크에 파일이 없는 경우(업로드가 커밋 뒤 쓰기에서 실패한 자리).
    if ((error as { code?: string }).code === "ENOENT") {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }
    throw error;
  }
}
