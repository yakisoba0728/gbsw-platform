import { NextResponse } from "next/server";
import { getSessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { uploadAttachment } from "@/modules/community/attachment.service";
import { CommunityError } from "@/modules/community/community.error";

/**
 * 첨부 업로드. **서버 액션이 아니라 라우트 핸들러다** —
 * `next.config.ts`의 `serverActions.bodySizeLimit`(6mb)이 서버 액션 전체에
 * 걸려서, 첨부를 위해 그 값을 올리면 명단 업로드를 포함한 모든 액션의 상한이
 * 함께 올라간다. 앱 컨테이너는 mem_limit 512m이고 Next는 액션 본문을 메모리에
 * 담는다.
 *
 * 대신 **`bodySizeLimit`이 이 경로에는 안 걸린다.** 용량을 재는 곳은
 * attachment.service의 문 ②뿐이다.
 */

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

export async function POST(request: Request) {
  // 리다이렉트가 아니라 401이다 — fetch로 부르는 경로라 로그인 화면 HTML을
  // 돌려받아 봐야 클라이언트가 할 일이 없다.
  //
  // **`requireAuth`가 막는 것을 여기서 손으로 다시 세운다** — 중지·삭제된 계정과
  // **mustChangePassword까지.** 앞의 둘만 보면 비밀번호를 바꾸라고 붙잡아 둔
  // 계정이 이 경로로만 앱을 쓰게 된다.
  const actor = await getSessionUser();
  if (!actor || actor.status !== "ACTIVE" || actor.deletedAt || actor.mustChangePassword) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했습니다." }, { status: 400 });
  }

  const slug = String(form.get("slug") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "파일을 골라 주세요." }, { status: 400 });
  }

  try {
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
