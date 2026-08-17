/**
 * 세션 생성을 막아야 하는 계정인가. status와 deletedAt을 독립적으로 본다 —
 * 하나만 되돌리는 실수가 생겨도 로그인이 뚫리지 않아야 한다.
 */
export function isLoginBlocked(
  user: { status?: string | null; deletedAt?: Date | null } | null | undefined,
): boolean {
  if (!user) return true;
  return user.status !== "ACTIVE" || user.deletedAt != null;
}
