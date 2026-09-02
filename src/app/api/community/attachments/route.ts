import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { uploadAttachment } from "@/modules/community/attachment.service";
import { CommunityError } from "@/modules/community/community.error";
import { getWritableBySlug } from "@/modules/community/board.service";
import { MAX_ATTACHMENT_BYTES } from "@/modules/community/community.schema";

// Route Handler에는 Server Action의 본문 제한이 적용되지 않는다.
const MAX_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + 1024 * 1024;

const MAX_CONCURRENT_UPLOADS = 3;
let uploadsInFlight = 0;

const MESSAGES: Record<string, string> = {
  COMMUNITY_NOT_FOUND: "게시판을 찾을 수 없습니다.",
  ATTACHMENT_NOT_ALLOWED: "이 게시판은 첨부를 받지 않습니다.",
  ATTACHMENT_TYPE: "올릴 수 없는 형식입니다.",
  ATTACHMENT_TOO_LARGE: "파일은 20MB를 넘을 수 없습니다.",
  ATTACHMENT_METADATA: "익명 게시판에는 위치·기기 정보를 지울 수 있는 사진만 올릴 수 있습니다.",
  ATTACHMENT_PENDING_LIMIT:
    "글에 붙이지 않은 첨부가 너무 많습니다. 쓰던 글을 저장하거나 잠시 후 다시 시도해 주세요.",
};

const STATUS: Record<string, number> = {
  COMMUNITY_NOT_FOUND: 404,
  ATTACHMENT_NOT_ALLOWED: 400,
  ATTACHMENT_TYPE: 415,
  ATTACHMENT_TOO_LARGE: 413,
  ATTACHMENT_METADATA: 422,
  ATTACHMENT_PENDING_LIMIT: 429,
};

async function readCappedBody(request: Request, max: number): Promise<Buffer | null> {
  const body = request.body;
  if (!body) return Buffer.alloc(0);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let seen = 0;
  let over = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    seen += value.byteLength;
    // 취소하면 Node 본문 파서가 예외를 내므로 초과분은 버리며 끝까지 읽는다.
    if (over) continue;
    if (seen > max) {
      over = true;
      chunks.length = 0;
      continue;
    }
    chunks.push(value);
  }

  return over ? null : Buffer.concat(chunks);
}

function gate(actor: SessionUser | null): actor is SessionUser {
  return (
    actor !== null &&
    actor.status === "ACTIVE" &&
    !actor.deletedAt &&
    !actor.mustChangePassword
  );
}

export async function POST(request: Request) {
  const actor = await getSessionUser();
  if (!gate(actor)) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const slug = new URL(request.url).searchParams.get("slug") ?? "";

  try {
    const community = await getWritableBySlug(actor, slug);
    if (!community.allowAttachments) {
      throw new CommunityError("ATTACHMENT_NOT_ALLOWED");
    }

    if (uploadsInFlight >= MAX_CONCURRENT_UPLOADS) {
      return NextResponse.json(
        { error: "지금은 올리는 사람이 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "retry-after": "5" } },
      );
    }
    uploadsInFlight += 1;

    try {
      const raw = await readCappedBody(request, MAX_REQUEST_BYTES);
      if (raw === null) {
        return NextResponse.json(
          { error: "파일은 20MB를 넘을 수 없습니다." },
          { status: 413 },
        );
      }

      const form = await new Response(new Uint8Array(raw), {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }).formData();

      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "파일을 골라 주세요." }, { status: 400 });
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new CommunityError("ATTACHMENT_TOO_LARGE");
      }

      const result = await uploadAttachment(actor, {
        slug,
        filename: file.name,
        bytes: Buffer.from(await file.arrayBuffer()),
      });
      return NextResponse.json(result, { status: 201 });
    } finally {
      uploadsInFlight -= 1;
    }
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: "이 게시판에 첨부할 권한이 없습니다." },
        { status: 403 },
      );
    }
    if (error instanceof CommunityError) {
      return NextResponse.json(
        { error: MESSAGES[error.message] ?? "올리지 못했습니다." },
        { status: STATUS[error.message] ?? 400 },
      );
    }
    throw error;
  }
}
