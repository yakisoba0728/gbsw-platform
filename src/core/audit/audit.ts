import { prisma } from "@/core/db/client";
import type { Prisma } from "@/generated/prisma/client";
import { readRequestContext } from "./request-context";

/** 감사 metadata에 넣을 수 있는 값 — JSON으로 직렬화 가능한 것만. */
export type AuditMetadata = Prisma.InputJsonObject;

/** 행위자 이름을 못 찾을 때 남기는 값. 계정이 이미 지워졌거나 조회가 실패한 경우. */
const UNKNOWN_ACTOR_NAME = "(알 수 없음)";

export type RecordAuditInput = {
  /**
   * 행위자 없음(가입 시도 중 자동 폐기 등, I9)을 표현할 수 있어야 하므로
   * null을 허용한다. AuditLog.actorUserId도 nullable이다.
   */
  actorUserId: string | null;
  /**
   * `"<모듈>:<동작>"` 형식. 권한 Action과 같은 이름을 쓰되,
   * 권한이 없는 변경(예: "merit:rule:deactivate")도 여기엔 남긴다.
   */
  action: string;
  /** 대상 모델명. 예) "MeritAward" */
  targetType: string;
  targetId?: string;
  metadata?: AuditMetadata;
  /**
   * 이미 알고 있는 행위자 이름을 넘긴다 — 넘기면 조회를 건너뛴다.
   *
   * 배치 호출(예: 275명 삭제 = 550회 순차 조회)이 매번 이름을 다시 묻지 않게
   * 하려는 **선택적** 경로다 (M8). actorUserId가 null이면(행위자 없음, I9)
   * 이 값이 실질적인 유일한 이름 출처다 — 넘기지 않으면 UNKNOWN_ACTOR_NAME으로
   * 떨어진다. 기존 규약(호출부가 조회를 빠뜨릴 수 없어야 한다)은 그대로다 —
   * 안 넘기면 예전처럼 매번 자동으로 조회한다.
   */
  actorName?: string;
};

/**
 * 감사로그 기록. 모든 생성/수정/삭제/권한변경은 서비스 계층에서 이걸 호출한다.
 *
 * 감사 기록 실패가 본 작업을 되돌리지는 않는다 —
 * 호출부에서 트랜잭션이 필요하면 직접 감싸야 한다.
 *
 * IP·브라우저는 호출부에서 받지 않고 여기서 직접 읽는다. 인자로 넘기게 하면
 * 새 모듈이 빠뜨려도 아무도 모르게 기록만 비어버린다. 행위자 이름은
 * actorName을 넘기지 않는 한 마찬가지로 여기서 직접 조회한다.
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
