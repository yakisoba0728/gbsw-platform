import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import * as repo from "./audit-log.repo";
import { PAGE_SIZE, periodStart, type AuditQuery } from "./audit-log.schema";

/** 감사로그 조회. 쓰기는 core/audit의 recordAudit가 담당한다. */
export async function readAuditLog(actor: SessionUser, query: AuditQuery) {
  if (!can(actor, "audit:read")) throw new Error("FORBIDDEN");

  const filter = {
    action: query.action || undefined,
    actor: query.actor || undefined,
    since: periodStart(query.period),
  };

  const skip = (query.page - 1) * PAGE_SIZE;

  const [entries, total, actions] = await Promise.all([
    repo.findPage(filter, skip, PAGE_SIZE),
    repo.countMatching(filter),
    repo.distinctActions(),
  ]);

  return {
    entries,
    total,
    actions,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
