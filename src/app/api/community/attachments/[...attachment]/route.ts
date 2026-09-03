import { NextResponse } from "next/server";
import { getSessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { getDownload } from "@/modules/community/attachment.service";
import { CommunityError } from "@/modules/community/community.error";
import {
  contentDisposition,
  openAttachment,
  parseRangeHeader,
} from "@/modules/community/community.storage";

export async function GET(
  request: Request,
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
    const verdict = parseRangeHeader(request.headers.get("range"), file.size);

    // 첨부용 CSP와 nosniff는 next.config.ts의 마지막 헤더 규칙에서 적용한다.
    const headers = new Headers({
      "Content-Type": file.mimeType,
      "Content-Disposition": contentDisposition(file.filename, file.inline),
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
    });

    if (verdict.kind === "unsatisfiable") {
      headers.set("Content-Range", `bytes */${file.size}`);
      return new NextResponse(null, { status: 416, headers });
    }

    const range = verdict.kind === "partial" ? verdict.range : undefined;
    if (range) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`);
    }
    headers.set(
      "Content-Length",
      String(range ? range.end - range.start + 1 : file.size),
    );

    // 20MB 파일을 통째로 힙에 올리지 않는다 — 디스크에서 응답으로 흘려보낸다.
    return new NextResponse(openAttachment(file.storageKey, file.storedAt, range), {
      status: range ? 206 : 200,
      headers,
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
