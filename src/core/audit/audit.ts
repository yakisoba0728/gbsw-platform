import { prisma } from "@/core/db/client";
import type { Prisma } from "@/generated/prisma/client";
import { readRequestContext } from "./request-context";

/** 감사 metadata에 넣을 수 있는 값 — JSON으로 직렬화 가능한 것만. */
export type AuditMetadata = Prisma.InputJsonObject;

/** 행위자 이름을 못 찾을 때 남기는 값. */
const UNKNOWN_ACTOR_NAME = "(알 수 없음)";

export type RecordAuditInput = {
  /** 행위자 없음(가입 시도 중 자동 폐기 등, I9)을 표현하려고 null을 허용한다. */
  actorUserId: string | null;
  /** `"<모듈>:<동작>"`. 권한 Action에 없는 변경도 여기엔 남긴다. */
  action: string;
  /** 대상 모델명. 예) "MeritAward" */
  targetType: string;
  targetId?: string;
  metadata?: AuditMetadata;
  /**
   * 넘기면 이름 조회를 건너뛴다 — 배치 호출이 매번 다시 묻지 않게 하는 선택지다 (M8).
   * actorUserId가 null이면 이 값이 유일한 이름 출처다.
   */
  actorName?: string;
};

/**
 * 감사로그 기록. 모든 생성/수정/삭제는 서비스 계층에서 이걸 호출한다.
 * 기록 실패가 본 작업을 되돌리지는 않는다 — 필요하면 호출부가 감싼다.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  const { ip, userAgent } = await readRequestContext();
  const actorName =
    input.actorName ??
    (input.actorUserId ? await lookupActorName(input.actorUserId) : UNKNOWN_ACTOR_NAME);

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
 * 기록 시점의 행위자 이름. 계정이 지워져도 남는 스냅샷이다.
 * 조회가 실패해도 던지지 않는다 — 감사 기록 자체가 실패하면 안 된다.
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
