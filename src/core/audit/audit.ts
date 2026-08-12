import { prisma } from "@/core/db/client";
import type { Prisma } from "@/generated/prisma/client";
import { readRequestContext } from "./request-context";

/** 감사 metadata에 넣을 수 있는 값 — JSON으로 직렬화 가능한 것만. */
export type AuditMetadata = Prisma.InputJsonObject;

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
 * IP·브라우저는 호출부에서 받지 않고 여기서 직접 읽는다.
 * 인자로 넘기게 하면 새 모듈이 빠뜨려도 아무도 모르게 기록만 비어버린다.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  const { ip, userAgent } = await readRequestContext();

  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata,
      ip,
      userAgent,
    },
  });
}
