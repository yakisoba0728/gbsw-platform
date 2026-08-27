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
 * 이 파일의 전부다 — 본문을 만지기 전에 권한을 보고, 본문은 상한까지만 메모리에
 * 모은다. 판정을 뒤에 두면 쓸 수 있는 게시판이 하나도 없는 계정이 400MB를 보내
 * 컨테이너를 죽일 수 있다.
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

/**
 * 본문을 상한까지만 모은다. 넘으면 `null`.
 *
 * **스트림을 중간에 끊지 않는다.** `controller.error()`나 `reader.cancel()`로
 * 끊으면 파싱기가 이미 닫힌 스트림에 뒤늦게 쓰려다 잡히지 않는 예외를 던지고,
 * 그것이 Node 프로세스를 죽인다 — 실제로 재현해서 확인했다. 막으려던 것보다
 * 나쁜 결과다.
 *
 * 그래서 끝까지 읽되 상한을 넘는 순간부터 **모은 것을 버리고 흘려보낸다.**
 * 바이트는 계속 들어오지만(대역폭은 프록시가 막는다) 메모리는 상한에 묶이고,
 * 스트림은 정상으로 끝나 아무도 죽지 않는다.
 */
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
    if (over) continue;
    if (seen > max) {
      over = true;
      // 이미 모은 것을 놓아 준다 — 여기부터는 읽기만 하고 안 쌓는다.
      chunks.length = 0;
      continue;
    }
    chunks.push(value);
  }

  return over ? null : Buffer.concat(chunks);
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

    // ② 본문 — 상한까지만 모은다. 넘으면 아무것도 파싱하지 않는다.
    const raw = await readCappedBody(request, MAX_REQUEST_BYTES);
    if (raw === null) {
      return NextResponse.json(
        { error: "파일은 5MB를 넘을 수 없습니다." },
        { status: 413 },
      );
    }

    // 모아 둔 바이트로 새 요청 본문을 세워 파싱한다. 원래 요청의
    // `content-type`에 multipart 경계가 들어 있어 그것만 그대로 옮긴다.
    const form = await new Response(new Uint8Array(raw), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();

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
