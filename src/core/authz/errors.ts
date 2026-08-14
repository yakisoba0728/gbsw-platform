import { recordAudit } from "@/core/audit/audit";
import { can, type Action } from "./can";

/**
 * 권한 거부. 코드형 오류 규약(CLAUDE.md 참고)을 따라 message는 항상 "FORBIDDEN"
 * 으로 고정한다 — 기존에 `throw new Error("FORBIDDEN")`을 잡던 자리
 * (`.rejects.toThrow("FORBIDDEN")` 등)가 이 클래스로 바꿔도 그대로 통과한다.
 * action은 어떤 권한에서 막혔는지 감사로그·서버 로그에 남기려고 들고 다닌다.
 */
export class ForbiddenError extends Error {
  readonly action: string;

  constructor(action: string) {
    super("FORBIDDEN");
    this.name = "ForbiddenError";
    this.action = action;
  }
}

/**
 * can() 검사와 거부 기록을 한 번에 한다 (I5).
 *
 * 예전엔 서비스마다 `if (!can(actor, action)) throw new Error("FORBIDDEN")`을
 * 반복했다. 액션의 catch가 이걸 DB 장애 같은 다른 오류와 구분 못 해 일반
 * 문구로 삼켰고, 학생이 관리자 서버 액션을 페이지 가드 없이 직접 호출해도
 * 감사로그에도 서버 로그에도 흔적이 남지 않았다 — 권한 침해 시도와 일시적
 * 장애가 똑같이 보였다. 이 헬퍼를 쓰면 거부 기록을 빠뜨릴 수 없다.
 *
 * 감사 실패가 본 동작(여기서는 "거부")을 되돌리면 안 된다는 기존 규약
 * (core/audit/audit.ts)과 같은 이유로, 기록이 실패해도 ForbiddenError는
 * 그대로 던진다 — try/catch로 감싼다.
 */
export async function assertCan(
  actor: { id: string; role?: string | null } | null | undefined,
  action: Action,
): Promise<void> {
  if (can(actor, action)) return;

  if (actor) {
    try {
      await recordAudit({
        actorUserId: actor.id,
        action: "authz:denied",
        targetType: "Authz",
        metadata: { action },
      });
    } catch {
      // 감사 기록 실패가 거부 자체를 막지 않는다.
    }
  }

  throw new ForbiddenError(action);
}
