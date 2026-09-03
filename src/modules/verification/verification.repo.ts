import { prisma, type DbClient } from "@/core/db/client";

export const LEGACY_TEMPORARY_BYPASS_HASH = "temporary-verification-bypass";

export async function lockVerificationTarget(
  channel: string,
  target: string,
  db: DbClient,
): Promise<void> {
  await db.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`verification:target:${channel}:${target}`}, 0))
  `;
}

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

/*
 * 모든 요청이 대상 → 초대 → IP 순으로 잠가 count와 insert를 직렬화한다.
 * 순서를 고정하는 것이 이 함수의 전부다 — 두 요청이 서로 다른 순서로 잡으면
 * 교착한다. 초대 잠금이 없으면 한 초대로 서로 다른 수신처에 병렬 요청할 때
 * 아무도 서로를 보지 못해 초대 예산이 그대로 넘어간다.
 */
export async function lockSendRateLimitBuckets(
  channel: string,
  target: string,
  inviteId: string | null,
  ip: string | null,
  db: DbClient,
): Promise<void> {
  await lockVerificationTarget(channel, target, db);

  if (inviteId) {
    await db.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`verification:invite:${inviteId}`}, 0))
    `;
  }

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
  challengeId: string;
  inviteId: string | null;
  channel: string;
  target: string;
  codeHash: string;
  expiresAt: Date;
  requestIp: string | null;
  verifiedAt?: Date | null;
  createdAt?: Date;
}, db: DbClient = prisma) {
  return db.verificationCode.create({ data: input });
}

/*
 * 예약 행이 발송을 기다리는 동안 고아로 오인되지 않게 두는 유예다. 외부 발송의
 * 상한(SMTP·알리고 모두 10초)보다 넉넉히 길게 잡는다. 이 값이 없으면 발송 중인
 * 예약 행을 다음 요청이 지워, 지워진 행이 세 한도(대상·초대·IP)의 계산에서
 * 모두 사라지고 발송 예산 자체가 무의미해진다.
 */
export const RESERVATION_GRACE_MS = 60_000;

/**
 * 활성화되지 못한 예약 행을 정리한다. 예약 행은 expiresAt이 예약 시각과 같고
 * 활성화에 성공한 행은 만료 시각이 생성 시각보다 뒤이므로(TTL 5분),
 * expiresAt <= createdAt인 죽은 행은 전부 활성화 실패분뿐이다. 정상 코드는
 * 만료돼도 발송 한도 산정 기록으로 남는다.
 *
 * **아직 발송 중인 예약 행은 지우지 않는다** — 유예를 지난 것만 고아로 본다.
 */
export async function deleteStaleReservations(
  channel: string,
  target: string,
  now: Date,
  db: DbClient = prisma,
): Promise<void> {
  const cutoff = new Date(now.getTime() - RESERVATION_GRACE_MS);
  await db.$executeRaw`
    DELETE FROM "VerificationCode"
    WHERE "channel" = ${channel}
      AND "target" = ${target}
      AND "consumedAt" IS NULL
      AND "verifiedAt" IS NULL
      AND "expiresAt" <= "createdAt"
      AND "createdAt" < ${cutoff}
  `;
}

export async function activateCode(
  id: string,
  expiresAt: Date,
  db: DbClient = prisma,
): Promise<void> {
  await db.verificationCode.update({
    where: { id },
    data: { expiresAt },
  });
}

export async function hasNewerActivatedCode(
  channel: string,
  target: string,
  id: string,
  now: Date,
  db: DbClient = prisma,
): Promise<boolean> {
  const current = await db.verificationCode.findUnique({
    where: { id },
    select: { createdAt: true },
  });
  if (!current) return true;

  const newer = await db.verificationCode.findFirst({
    where: {
      channel,
      target,
      // 예약 행은 expiresAt이 예약 시각이라 여기 포함되지 않는다.
      // 발송 뒤 활성화된 더 최신 행만 이전 발송의 늦은 활성화를 막는다.
      expiresAt: { gt: now },
      OR: [
        { createdAt: { gt: current.createdAt } },
        { createdAt: current.createdAt, id: { gt: id } },
      ],
    },
    select: { id: true },
  });
  return newer !== null;
}

export async function findLiveCode(
  channel: string,
  target: string,
  now: Date,
  db: DbClient = prisma,
) {
  return db.verificationCode.findFirst({
    where: {
      channel,
      target,
      consumedAt: null,
      verifiedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
}

/*
 * 확인은 이 함수로만 행을 찾는다. (channel, target)으로 찾으면 대상 주소만 아는
 * 제3자가 남의 활성 코드에 시도 횟수를 쌓을 수 있다.
 */
export async function findLiveByChallenge(
  challengeId: string,
  now: Date,
  db: DbClient = prisma,
) {
  return db.verificationCode.findFirst({
    where: {
      challengeId,
      consumedAt: null,
      verifiedAt: null,
      expiresAt: { gt: now },
    },
  });
}

/* 같은 challenge에 대한 병렬 대입을 한 줄로 세운다. */
export async function lockChallenge(
  challengeId: string,
  db: DbClient,
): Promise<void> {
  await db.$queryRaw`
    SELECT "id" FROM "VerificationCode" WHERE "challengeId" = ${challengeId} FOR UPDATE
  `;
}

/* 초대 하나가 임의의 수신처로 발송을 반복하지 못하게 예산을 센다. */
export async function countRecentSendsByInvite(
  inviteId: string,
  since: Date,
  db: DbClient = prisma,
): Promise<number> {
  return db.verificationCode.count({
    where: { inviteId, createdAt: { gte: since } },
  });
}

export async function findVerifiedByChallenge(
  challengeId: string,
  verifiedAfter: Date,
  db: DbClient = prisma,
) {
  return db.verificationCode.findFirst({
    where: {
      challengeId,
      consumedAt: null,
      codeHash: { not: LEGACY_TEMPORARY_BYPASS_HASH },
      verifiedAt: { gte: verifiedAfter },
    },
  });
}

export async function bumpAttempts(
  id: string,
  db: DbClient = prisma,
): Promise<number> {
  const row = await db.verificationCode.update({
    where: { id },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });
  return row.attempts;
}

export async function expireById(
  id: string,
  now: Date,
  db: DbClient = prisma,
): Promise<void> {
  await db.verificationCode.update({
    where: { id },
    data: { expiresAt: now },
  });
}

export async function markVerified(
  id: string,
  now: Date,
  db: DbClient = prisma,
): Promise<void> {
  await db.verificationCode.update({
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
      codeHash: { not: LEGACY_TEMPORARY_BYPASS_HASH },
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
    where: {
      id: { in: ids },
      consumedAt: null,
      codeHash: { not: LEGACY_TEMPORARY_BYPASS_HASH },
      verifiedAt: { not: null },
    },
    data: { consumedAt: now },
  });
  return count;
}

export async function deleteById(id: string): Promise<void> {
  await prisma.verificationCode.delete({ where: { id } });
}
