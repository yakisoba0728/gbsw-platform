import { prisma, type DbClient, withTransaction } from "@/core/db/client";

/**
 * 최초 관리자 생성을 직렬화하는 advisory lock 키.
 *
 * 콘솔 토큰은 프로세스 메모리에 있어 인스턴스가 둘이면 각자 다른 토큰을 찍고 각자
 * 「사용자 0명」을 관찰한다 — 확인과 생성을 하나로 묶는 일은 DB만 할 수 있다.
 *
 * 값은 `sha256("gbsw:bootstrap:initial-admin")`의 앞 8바이트를 부호 있는 64비트로 읽은 것이다.
 * `node -e 'console.log(require("crypto").createHash("sha256").update("gbsw:bootstrap:initial-admin").digest().readBigInt64BE(0))'`
 * 로 다시 뽑을 수 있다. 저장소에서 advisory lock을 쓰는 곳은 지금 여기 하나뿐이며
 * (`grep -r pg_advisory src/`), 새로 쓰는 곳이 생기면 같은 방식으로 **다른 문자열에서**
 * 뽑아 키가 겹치지 않게 한다.
 *
 * tsconfig의 target이 ES2017이라 BigInt 리터럴(`123n`)을 쓸 수 없다.
 */
export const BOOTSTRAP_LOCK_KEY = BigInt("3789841922542709004");

/**
 * 최초 관리자 생성을 한 줄로 세운다. 트랜잭션이 끝나면 커밋·롤백 어느 쪽이든 저절로
 * 풀리는 잠금이라(`_xact_`) 실패한 요청이 잠금을 들고 남지 않는다.
 *
 * 다른 잠금과 달리 `$queryRaw`가 아니라 `$executeRaw`인 것은 반환형이 `void`여서
 * 드라이버 어댑터가 결과 열을 매핑하지 못하기 때문이다.
 */
export async function lockBootstrap(db: DbClient): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY}::bigint)`;
}

export async function countUsers(db: DbClient = prisma): Promise<number> {
  return db.user.count();
}

type CreateAdminUserInput = {
  userId: string;
  accountId: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
};

async function createAdminUserWithDb(
  db: DbClient,
  input: CreateAdminUserInput,
): Promise<void> {
  await db.user.create({
    data: {
      id: input.userId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      emailVerified: true,
      role: "ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
    },
  });

  await db.account.create({
    data: {
      id: input.accountId,
      accountId: input.userId,
      providerId: "credential",
      userId: input.userId,
      password: input.passwordHash,
    },
  });
}

export async function createAdminUser(
  input: CreateAdminUserInput,
  db?: DbClient,
): Promise<void> {
  if (db) {
    await createAdminUserWithDb(db, input);
    return;
  }

  await withTransaction((tx) => createAdminUserWithDb(tx, input));
}
