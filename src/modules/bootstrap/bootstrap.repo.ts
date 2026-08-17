import { prisma } from "@/core/db/client";

/** Prisma 호출만 둔다. `can()` 없이 쓰는 유일한 모듈이다 (service 주석 참고). */

export async function countUsers(): Promise<number> {
  return prisma.user.count();
}

export type CreateAdminUserInput = {
  userId: string;
  accountId: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
};

export async function createAdminUser(
  input: CreateAdminUserInput,
): Promise<void> {
  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: input.userId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        emailVerified: true,
        role: "ADMIN",
        status: "ACTIVE",
        // 본인이 방금 정한 비밀번호라 강제 변경이 필요 없다.
        mustChangePassword: false,
      },
    }),
    prisma.account.create({
      data: {
        id: input.accountId,
        // credential 로그인에서는 accountId가 곧 userId다.
        accountId: input.userId,
        providerId: "credential",
        userId: input.userId,
        password: input.passwordHash,
      },
    }),
  ]);
}
