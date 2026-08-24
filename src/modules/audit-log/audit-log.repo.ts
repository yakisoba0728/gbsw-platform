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
    // actorName은 기록 시점 스냅샷이라 계정이 지워져도 남는다 — 삭제된 행위자도
    // 이름으로는 검색돼야 하므로 실시간 관계 대신 이 필드로 찾는다. 이메일은
    // 스냅샷이 없으므로 그대로 관계에서 찾는다 (계정이 지워지면 못 찾는다).
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
    // 보조 정렬키가 없으면 쪽 경계가 흔들린다. createdAt의 기본값
    // CURRENT_TIMESTAMP는 Postgres에서 **트랜잭션 시작 시각**이라 명단 일괄 반영
    // 한 번이 남긴 수백 줄이 밀리초까지 같은 값을 갖는데, SQL은 정렬키가 같은 행
    // 사이의 순서를 보장하지 않는다 — OFFSET이 달라지면 동점 구간 순서가 뒤집혀
    // 어느 쪽에도 안 나오는 줄이 생긴다. 감사로그에서 "안 보인다"는 "없다"로 읽힌다.
    // id는 cuid라 시간순은 아니지만 유일하고 결정적이다 — 쪽 경계를 고정하는 데
    // 필요한 것은 시간순이 아니라 유일성이다.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
    // 이름은 actorName 스냅샷을 쓴다 — 계정이 지워져도 남아야 한다.
    // email·role은 계정이 살아 있을 때만 의미가 있어 관계에서 그대로 읽는다.
    include: { actor: { select: { email: true, role: true } } },
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
