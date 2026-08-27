import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { uploadAttachment } from "@/modules/community/attachment.service";
import { CommunityError } from "@/modules/community/community.error";
import { getWritableBySlug } from "@/modules/community/board.service";
import { MAX_ATTACHMENT_BYTES } from "@/modules/community/community.schema";

/**
 * 첨부 업로드. **서버 액션이 아니라 라우트 핸들러다** —
 * `next.config.ts`의 `serverActions.bodySizeLimit`(6mb)이 서버 액션 전체에
 * 걸려서, 첨부를 위해 그 값을 올리면 명단 업로드를 포함한 모든 액션의 상한이
 * 함께 올라간다. 앱 컨테이너는 mem_limit 512m이고 Next는 액션 본문을 메모리에
 * 담는다.
 *
 * **그 대가로 이 경로에는 아무 상한도 자동으로 걸리지 않는다.** 그래서 순서가
 * 이 파일의 전부다 — 본문을 만지기 전에 권한을 보고, 본문을 읽는 동안 바이트를
 * 세어 상한을 넘으면 그 자리에서 끊는다. 판정을 뒤에 두면 쓸 수 있는 게시판이
 * 하나도 없는 계정이 400MB를 보내 컨테이너를 죽일 수 있다.
 */

/**
 * 요청 본문의 상한. 파일 하나가 5MB이고 multipart 경계·헤더에 여유를 둔다.
 * `MAX_ATTACHMENT_BYTES`(파일 자체)와 다른 값이라 따로 둔다.
 */
const MAX_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + 512 * 1024;

const MESSAGES: Record<string, string> = {
  COMMUNITY_NOT_FOUND: "게시판을 찾을 수 없습니다.",
  ATTACHMENT_NOT_ALLOWED: "이 게시판은 첨부를 받지 않습니다.",
  ATTACHMENT_TYPE: "올릴 수 없는 형식입니다.",
  ATTACHMENT_TOO_LARGE: "파일은 5MB를 넘을 수 없습니다.",
  ATTACHMENT_PENDING_LIMIT:
    "글에 붙이지 않은 첨부가 너무 많습니다. 쓰던 글을 저장하거나 잠시 후 다시 시도해 주세요.",
};

/** 오류 코드 → HTTP 상태. 클라이언트가 다시 시도할지 정하는 데 쓴다. */
const STATUS: Record<string, number> = {
  COMMUNITY_NOT_FOUND: 404,
  ATTACHMENT_NOT_ALLOWED: 400,
  ATTACHMENT_TYPE: 415,
  ATTACHMENT_TOO_LARGE: 413,
  ATTACHMENT_PENDING_LIMIT: 429,
};

/** 본문이 상한을 넘겼다. 스트림을 읽다 말고 던진다. */
class BodyTooLarge extends Error {}

/**
 * 본문을 세면서 흘려보낸다. 상한을 넘는 순간 스트림을 오류로 끊어, 파싱기가
 * 나머지를 메모리에 담기 전에 멈추게 한다.
 *
 * `content-length`만 보고 판단하지 않는다 — chunked 요청에는 그 헤더가 없고,
 * 있어도 보내는 쪽이 적는 값이라 실제 바이트 수와 다를 수 있다. 세는 것은
 * 흘러 들어온 바이트다.
 */
function capBody(request: Request, max: number): Request {
  const body = request.body;
  if (!body) return request;

  let seen = 0;
  const capped = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max) {
          controller.error(new BodyTooLarge());
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );

  // 스트림을 본문으로 주려면 duplex: "half"가 필요하다. 타입에 아직 없다.
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: capped,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

/** `requireAuth`가 막는 것을 손으로 다시 세운다 — **mustChangePassword까지.** */
function gate(actor: SessionUser | null): actor is SessionUser {
  return (
    actor !== null &&
    actor.status === "ACTIVE" &&
    !actor.deletedAt &&
    !actor.mustChangePassword
  );
}

export async function POST(request: Request) {
  // 리다이렉트가 아니라 401이다 — fetch로 부르는 경로라 로그인 화면 HTML을
  // 돌려받아 봐야 클라이언트가 할 일이 없다.
  const actor = await getSessionUser();
  if (!gate(actor)) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // **게시판을 쿼리로 받는 이유가 여기 있다.** 본문 안에 있으면 권한을 보려고
  // 본문을 먼저 파싱해야 하고, 그 순간 상한 없는 바이트가 메모리에 올라온다.
  const slug = new URL(request.url).searchParams.get("slug") ?? "";

  try {
    // ① 권한 — 바이트를 만지기 전에.
    const community = await getWritableBySlug(actor, slug);
    if (!community.allowAttachments) {
      throw new CommunityError("ATTACHMENT_NOT_ALLOWED");
    }

    // ② 본문 — 세면서 읽는다. 상한을 넘으면 BodyTooLarge로 끊긴다.
    const form = await capBody(request, MAX_REQUEST_BYTES).formData();

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "파일을 골라 주세요." }, { status: 400 });
    }
    // 바이트를 한 벌 더 복사하기 전에 크기부터 본다.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new CommunityError("ATTACHMENT_TOO_LARGE");
    }

    // ③ 형식·미결 수·저장 — 서비스가 권한을 한 번 더 검사한다 (defense-in-depth).
    const result = await uploadAttachment(actor, {
      slug,
      filename: file.name,
      mimeType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof BodyTooLarge || isCausedByBodyTooLarge(error)) {
      return NextResponse.json(
        { error: "파일은 5MB를 넘을 수 없습니다." },
        { status: 413 },
      );
    }
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

/**
 * `formData()`가 스트림 오류를 자기 오류로 감싸 던지는 런타임이 있다.
 * 원인 사슬을 따라가 우리가 끊은 것인지 본다 — 아니면 500으로 올려 보낸다.
 */
function isCausedByBodyTooLarge(error: unknown): boolean {
  let cause: unknown = (error as { cause?: unknown })?.cause;
  for (let depth = 0; depth < 5 && cause; depth += 1) {
    if (cause instanceof BodyTooLarge) return true;
    cause = (cause as { cause?: unknown })?.cause;
  }
  return false;
}
