import { prisma, type DbClient } from "@/core/db/client";
import { isTransactionFatal } from "@/core/db/transaction-conflict";
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
 * 감사로그 기록. 성공한 생성/수정/삭제는 서비스 계층에서 업무 쓰기와 같은
 * 트랜잭션 클라이언트를 넘겨 함께 커밋하거나 함께 롤백해야 한다.
 * AuditLog.create 실패는 호출자에게 전파되어 그 트랜잭션을 중단시킨다.
 */
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

/**
 * 여러 줄을 한 번에 남긴다. **왕복 수가 곧 잠금을 쥐고 있는 시간인 자리**에서 쓴다 —
 * 명단 반영은 `AcademicYear`에 FOR UPDATE를 걸고 끝까지 쥐는데, 그 잠금은 상벌점
 * 부여도 잡는다. 학생 수만큼 왕복하면 그동안 전교의 부여가 한 건도 안 나간다.
 *
 * 한 줄씩 남기는 것과 결과는 같다. 이름은 행위자별로 한 번만 묻고(대개 한 명이다),
 * 요청 맥락(ip·userAgent)은 어차피 호출 하나에 하나뿐이다.
 *
 * 빈 배열이면 아무것도 하지 않는다 — 부르는 쪽에서 길이를 먼저 재지 않아도 되게.
 */
export async function recordAuditMany(
  inputs: RecordAuditInput[],
  db: DbClient = prisma,
): Promise<void> {
  if (inputs.length === 0) return;

  const { ip, userAgent } = await readRequestContext();

  // 이름을 안 넘긴 행위자만, 중복 없이 한 번씩 묻는다.
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

/**
 * 기록 시점의 행위자 이름. 계정이 지워져도 남는 스냅샷이다.
 * "이름을 못 찾았다"는 삼키고 (알 수 없음)으로 떨어진다 — 감사 기록 자체가
 * 그것 때문에 실패하면 안 된다. 다만 **트랜잭션이 죽은 오류는 삼키지 않는다**:
 * 삼켜도 어차피 뒤따르는 create가 죽고, 원래 오류 코드만 사라진다.
 */
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
    if (isTransactionFatal(error)) throw error;
    return UNKNOWN_ACTOR_NAME;
  }
}
