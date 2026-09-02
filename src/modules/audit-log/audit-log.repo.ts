import { prisma } from "@/core/db/client";
import type { Prisma } from "@/generated/prisma/client";

export type AuditFilter = {
  action?: string;
  actor?: string;
  since: Date | null;
};

function toWhere(filter: AuditFilter): Prisma.AuditLogWhereInput {
  return {
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.since ? { createdAt: { gte: filter.since } } : {}),
    ...(filter.actor
      ? {
          OR: [
            { actorName: { contains: filter.actor, mode: "insensitive" } },
            { actor: { email: { contains: filter.actor, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function findPage(
  filter: AuditFilter,
  skip: number,
  take: number,
) {
  return prisma.auditLog.findMany({
    where: toWhere(filter),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
    include: { actor: { select: { email: true, role: true } } },
  });
}

export async function countMatching(filter: AuditFilter): Promise<number> {
  return prisma.auditLog.count({ where: toWhere(filter) });
}

export async function distinctActions(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
}
