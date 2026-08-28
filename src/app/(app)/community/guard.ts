import { notFound, redirect } from "next/navigation";
import { ForbiddenError } from "@/core/authz/errors";
import { CommunityError } from "@/modules/community/community.error";

/**
 * 게시판 화면이 서비스에서 받은 거부를 **제 화면으로** 보낸다 —
 * 없는 게시판·글은 404, 권한 없음은 403.
 *
 * 이 자리가 따로 필요한 이유는 커뮤니티의 읽기·쓰기 판정이 `can()` 밖에 있기
 * 때문이다. 다른 화면은 `requirePermission()`이 페이지 첫 줄에서 막아 주지만,
 * 게시판별 권한은 게시판 행을 읽어야 알 수 있어 서비스가 조회를 마친 뒤에야
 * `ForbiddenError`로 돌아온다. 그대로 흘려 보내면 `(app)/error.tsx`의
 * 「화면을 열지 못했습니다」가 떠서 **없는 게시판과 못 보는 게시판이 한 화면이
 * 된다** — 원인을 안 알려 줄 뿐 아니라 둘을 구별할 수도 없다.
 *
 * `forbidden()`·`notFound()` 중 앞의 것을 안 쓰는 이유는 저장소가
 * `authInterrupts`를 켜지 않아서다. `requirePermission()`도 같은 이유로
 * `/forbidden`에 redirect한다.
 *
 * **거부 감사로그는 서비스가 이미 남겼다.** 여기서 다시 남기지 않는다.
 */
export async function orDenied<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/forbidden");
    // 코드가 message에 담긴다 (오류 규약). 「없다」 계열만 404로 보낸다 —
    // SLUG_TAKEN·ANONYMOUS_IRREVERSIBLE 같은 것은 화면이 아니라 액션의 몫이다.
    if (error instanceof CommunityError && error.message.endsWith("NOT_FOUND")) {
      notFound();
    }
    throw error;
  }
}
