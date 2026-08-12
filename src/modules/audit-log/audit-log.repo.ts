import { prisma } from "@/core/db/client";
import type { Prisma } from "@/generated/prisma/client";

/** Prisma 호출만 둔다. 감사로그는 append-only이므로 조회만 있다. */

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
          actor: {
            OR: [
              { name: { contains: filter.actor, mode: "insensitive" } },
              { email: { contains: filter.actor, mode: "insensitive" } },
            ],
          },
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
    orderBy: { createdAt: "desc" },
    skip,
    take,
    include: { actor: { select: { name: true, email: true, role: true } } },
  });
}

export async function countMatching(filter: AuditFilter): Promise<number> {
  return prisma.auditLog.count({ where: toWhere(filter) });
}

/** 필터 목록에 쓸, 실제로 기록된 적 있는 액션들. */
export async function distinctActions(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
}
