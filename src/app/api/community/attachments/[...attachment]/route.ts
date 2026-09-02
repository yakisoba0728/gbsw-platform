import { NextResponse } from "next/server";
import { getSessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { getDownload } from "@/modules/community/attachment.service";
import { CommunityError } from "@/modules/community/community.error";
import { contentDisposition } from "@/modules/community/community.storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachment: string[] }> },
) {
  const actor = await getSessionUser();
  if (!actor || actor.status !== "ACTIVE" || actor.deletedAt || actor.mustChangePassword) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const [attachmentId] = await params.then((p) => p.attachment);
  if (!attachmentId) {
    return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const file = await getDownload(actor, attachmentId);

    // 첨부용 CSP와 nosniff는 next.config.ts의 마지막 헤더 규칙에서 적용한다.
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.byteLength),
        "Content-Disposition": contentDisposition(file.filename, file.inline),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    // 권한과 파일 존재 여부를 동일한 404로 숨긴다.
    if (error instanceof ForbiddenError || error instanceof CommunityError) {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }
    if ((error as { code?: string }).code === "ENOENT") {
      return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    }
    throw error;
  }
}
