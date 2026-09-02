import { recordAudit, type RecordAuditInput } from "@/core/audit/audit";
import { can, type Action } from "./can";

export class ForbiddenError extends Error {
  readonly action: string;

  constructor(action: string) {
    super("FORBIDDEN");
    this.name = "ForbiddenError";
    this.action = action;
  }
}

export async function assertCan(
  actor: { id: string; role?: string | null } | null | undefined,
  action: Action,
): Promise<void> {
  if (can(actor, action)) return;
  return denyAccess(actor, action);
}

export async function denyAccess(
  actor: { id: string } | null | undefined,
  action: string,
  details: Omit<RecordAuditInput, "actorUserId" | "action"> = { targetType: "Authz" },
): Promise<never> {
  if (actor) {
    try {
      await recordAudit({
        ...details,
        actorUserId: actor.id,
        action: "authz:denied",
        metadata: { ...details.metadata, action },
      });
    } catch {
      // 거부는 감사 저장 여부와 무관하게 유지한다.
    }
  }

  throw new ForbiddenError(action);
}
