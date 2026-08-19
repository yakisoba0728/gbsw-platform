import { prisma, type DbClient } from "@/core/db/client";

/** Prisma 호출만 둔다. 이 모듈은 감사로그를 남기지 않는다 (service 주석 참고). */

export async function countRecentSends(
  channel: string,
  target: string,
  since: Date,
  db: DbClient = prisma,
): Promise<number> {
  return db.verificationCode.count({
    where: { channel, target, createdAt: { gte: since } },
  });
}

/** 같은 IP에서 최근 보낸 횟수 (I4). channel을 가리지 않고 센다. */
export async function countRecentSendsByIp(
  ip: string,
  since: Date,
  db: DbClient = prisma,
): Promise<number> {
  return db.verificationCode.count({
    where: { requestIp: ip, createdAt: { gte: since } },
  });
}

/**
 * 한도 검사와 proof 발급 사이의 틈을 닫는다. 같은 대상·같은 IP 버킷은 트랜잭션
 * 안에서 순서대로 세고 만든다.
 */
export async function lockSendRateLimitBuckets(
  channel: string,
  target: string,
  ip: string | null,
  db: DbClient,
): Promise<void> {
  await db.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`verification:target:${channel}:${target}`}, 0))
  `;

  if (!ip) return;

  await db.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`verification:ip:${ip}`}, 0))
  `;
}

/** 같은 대상의 아직 안 쓴 코드를 모두 만료시킨다 — 마지막 코드만 유효하게. */
export async function expirePending(
  channel: string,
  target: string,
  now: Date,
  db: DbClient = prisma,
): Promise<void> {
  await db.verificationCode.updateMany({
    where: { channel, target, consumedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
}

export async function insertCode(input: {
  channel: string;
  target: string;
  codeHash: string;
  expiresAt: Date;
  requestIp: string | null;
  verifiedAt?: Date | null;
}, db: DbClient = prisma) {
  return db.verificationCode.create({ data: input });
}

/** 아직 살아 있는 최신 코드 한 건. */
export async function findLiveCode(
  channel: string,
  target: string,
  now: Date,
) {
  return prisma.verificationCode.findFirst({
    where: { channel, target, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
}

export async function bumpAttempts(id: string): Promise<number> {
  const row = await prisma.verificationCode.update({
    where: { id },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });
  return row.attempts;
}

export async function expireById(id: string, now: Date): Promise<void> {
  await prisma.verificationCode.update({
    where: { id },
    data: { expiresAt: now },
  });
}

export async function markVerified(id: string, now: Date): Promise<void> {
  await prisma.verificationCode.update({
    where: { id },
    data: { verifiedAt: now },
  });
}

/** 가입 시점에 "확인 끝났고 아직 안 쓴" 코드를 찾는다. */
export async function findVerified(
  channel: string,
  target: string,
  verifiedAfter: Date,
) {
  return prisma.verificationCode.findFirst({
    where: {
      channel,
      target,
      consumedAt: null,
      verifiedAt: { gte: verifiedAfter },
    },
    orderBy: { verifiedAt: "desc" },
  });
}

export async function consume(
  ids: string[],
  now: Date,
  db: DbClient = prisma,
): Promise<number> {
  if (ids.length === 0) return 0;

  const { count } = await db.verificationCode.updateMany({
    where: { id: { in: ids }, consumedAt: null, verifiedAt: { not: null } },
    data: { consumedAt: now },
  });
  return count;
}

/** 발송 실패로 무의미해진 코드를 지운다. */
export async function deleteById(id: string): Promise<void> {
  await prisma.verificationCode.delete({ where: { id } });
}
