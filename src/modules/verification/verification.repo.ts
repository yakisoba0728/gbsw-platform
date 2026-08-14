import { prisma } from "@/core/db/client";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

export async function countRecentSends(
  channel: string,
  target: string,
  since: Date,
): Promise<number> {
  return prisma.verificationCode.count({
    where: { channel, target, createdAt: { gte: since } },
  });
}

/**
 * 같은 접속 IP에서 최근 보낸 횟수 (I4). 대상(target)은 공격자가 마음대로
 * 바꿀 수 있어 countRecentSends(대상별)만으로는 한 IP가 임의의 번호마다
 * 계속 발송을 촉발하는 것을 막지 못한다 — channel을 가리지 않고 센다
 * (이메일·전화 어느 쪽이든 같은 IP의 남용은 같은 자원을 축낸다).
 */
export async function countRecentSendsByIp(
  ip: string,
  since: Date,
): Promise<number> {
  return prisma.verificationCode.count({
    where: { requestIp: ip, createdAt: { gte: since } },
  });
}

/** 같은 대상의 아직 안 쓴 코드를 모두 만료시킨다 — 마지막 코드만 유효하게. */
export async function expirePending(
  channel: string,
  target: string,
  now: Date,
): Promise<void> {
  await prisma.verificationCode.updateMany({
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
}) {
  return prisma.verificationCode.create({ data: input });
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

export async function consume(ids: string[], now: Date): Promise<void> {
  await prisma.verificationCode.updateMany({
    where: { id: { in: ids } },
    data: { consumedAt: now },
  });
}

/** 발송 실패로 무의미해진 코드를 지운다. */
export async function deleteById(id: string): Promise<void> {
  await prisma.verificationCode.delete({ where: { id } });
}
