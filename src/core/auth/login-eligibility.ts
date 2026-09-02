export function isLoginBlocked(
  user: { status?: string | null; deletedAt?: Date | null } | null | undefined,
): boolean {
  if (!user) return true;
  return user.status !== "ACTIVE" || user.deletedAt != null;
}
