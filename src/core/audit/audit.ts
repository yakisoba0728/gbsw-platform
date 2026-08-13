import { prisma } from "@/core/db/client";
import type { Prisma } from "@/generated/prisma/client";
import { readRequestContext } from "./request-context";

/** 감사 metadata에 넣을 수 있는 값 — JSON으로 직렬화 가능한 것만. */
export type AuditMetadata = Prisma.InputJsonObject;

/** 행위자 이름을 못 찾을 때 남기는 값. 계정이 이미 지워졌거나 조회가 실패한 경우. */
const UNKNOWN_ACTOR_NAME = "(알 수 없음)";

export type RecordAuditInput = {
  actorUserId: string;
  /**
   * `"<모듈>:<동작>"` 형식. 권한 Action과 같은 이름을 쓰되,
   * 권한이 없는 변경(예: "merit:rule:deactivate")도 여기엔 남긴다.
   */
  action: string;
  /** 대상 모델명. 예) "MeritAward" */
  targetType: string;
  targetId?: string;
  metadata?: AuditMetadata;
};

/**
 * 감사로그 기록. 모든 생성/수정/삭제/권한변경은 서비스 계층에서 이걸 호출한다.
 *
 * 감사 기록 실패가 본 작업을 되돌리지는 않는다 —
 * 호출부에서 트랜잭션이 필요하면 직접 감싸야 한다.
 *
 * IP·브라우저·행위자 이름은 호출부에서 받지 않고 여기서 직접 읽는다.
 * 인자로 넘기게 하면 새 모듈이 빠뜨려도 아무도 모르게 기록만 비어버린다.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  const { ip, userAgent } = await readRequestContext();
  const actorName = await lookupActorName(input.actorUserId);

  await prisma.auditLog.create({
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

/**
 * 기록 시점의 행위자 이름을 조회한다. 계정이 나중에 지워져도 이 값은 남는다
 * (actorUserId는 SetNull이라 사라질 수 있지만 actorName은 스냅샷이다).
 *
 * 조회 실패로 감사 기록 자체가 실패하면 안 되므로 던지지 않는다.
 */
async function lookupActorName(actorUserId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { name: true },
    });
    return user?.name ?? UNKNOWN_ACTOR_NAME;
  } catch {
    return UNKNOWN_ACTOR_NAME;
  }
}
