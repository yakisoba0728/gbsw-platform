import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import * as repo from "./audit-log.repo";
import { PAGE_SIZE, periodStart, type AuditQuery } from "./audit-log.schema";

export async function readAuditLog(actor: SessionUser, query: AuditQuery) {
  await assertCan(actor, "audit:read");

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
