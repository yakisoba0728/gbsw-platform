import { recordAudit } from "@/core/audit/audit";
import { can, type Action } from "./can";

/**
 * 권한 거부. message는 항상 "FORBIDDEN"이고, action은 어떤 권한에서 막혔는지
 * 감사로그에 남기려고 들고 다닌다.
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
 * can() 검사와 거부 기록을 한 번에 한다 (I5) — 이걸 쓰면 거부 기록을 빠뜨릴 수 없다.
 * 기록이 실패해도 ForbiddenError는 그대로 던진다.
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
