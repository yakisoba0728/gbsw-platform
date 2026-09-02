import { prisma, type DbClient } from "@/core/db/client";
import { isTransactionFatal } from "@/core/db/transaction-conflict";
import type { Prisma } from "@/generated/prisma/client";
import { readRequestContext } from "./request-context";

const UNKNOWN_ACTOR_NAME = "(알 수 없음)";

export type RecordAuditInput = {
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Prisma.InputJsonObject;
  actorName?: string;
};

// 도메인 변경은 같은 트랜잭션을 전달한다. 감사 저장 실패도 함께 롤백한다.
export async function recordAudit(
  input: RecordAuditInput,
  db: DbClient = prisma,
): Promise<void> {
  const { ip, userAgent } = await readRequestContext();
  const actorName =
    input.actorName ??
    (input.actorUserId ? await lookupActorName(input.actorUserId, db) : UNKNOWN_ACTOR_NAME);

  await db.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorName,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata,
      ip,
      userAgent,
    },
  });
}

export async function recordAuditMany(
  inputs: RecordAuditInput[],
  db: DbClient = prisma,
): Promise<void> {
  if (inputs.length === 0) return;

  const { ip, userAgent } = await readRequestContext();

  const names = new Map<string, string>();
  for (const input of inputs) {
    const id = input.actorUserId;
    if (input.actorName || id === null || names.has(id)) continue;
    names.set(id, await lookupActorName(id, db));
  }

  await db.auditLog.createMany({
    data: inputs.map((input) => ({
      actorUserId: input.actorUserId,
      actorName:
        input.actorName ??
        (input.actorUserId ? names.get(input.actorUserId)! : UNKNOWN_ACTOR_NAME),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata,
      ip,
      userAgent,
    })),
  });
}

async function lookupActorName(
  actorUserId: string,
  db: DbClient,
): Promise<string> {
  try {
    const user = await db.user.findUnique({
      where: { id: actorUserId },
      select: { name: true },
    });
    return user?.name ?? UNKNOWN_ACTOR_NAME;
  } catch (error) {
    // 이름 조회만 대체할 수 있다. 중단된 트랜잭션은 재시도 판단을 위해 전파한다.
    if (isTransactionFatal(error)) throw error;
    return UNKNOWN_ACTOR_NAME;
  }
}
