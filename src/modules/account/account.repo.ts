import { prisma } from "@/core/db/client";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

export async function clearMustChangePassword(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { mustChangePassword: false },
  });
}
