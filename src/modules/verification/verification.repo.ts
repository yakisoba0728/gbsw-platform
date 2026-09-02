import { prisma, type DbClient } from "@/core/db/client";

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

export async function countRecentSendsByIp(
  ip: string,
  since: Date,
  db: DbClient = prisma,
): Promise<number> {
  return db.verificationCode.count({
    where: { requestIp: ip, createdAt: { gte: since } },
  });
}

export async function lockSendRateLimitBuckets(
  channel: string,
  target: string,
  ip: string | null,
  db: DbClient,
): Promise<void> {
  // 모든 요청이 대상 → IP 순으로 잠가 count와 insert를 직렬화한다.
  await db.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`verification:target:${channel}:${target}`}, 0))
  `;

  if (!ip) return;

  await db.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`verification:ip:${ip}`}, 0))
  `;
}

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

export async function deleteById(id: string): Promise<void> {
  await prisma.verificationCode.delete({ where: { id } });
}
