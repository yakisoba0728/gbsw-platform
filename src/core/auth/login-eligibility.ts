/**
 * 세션 생성을 막아야 하는 계정인지 판정하는 순수 함수.
 *
 * status(비활성)와 deletedAt(삭제됨)을 **독립적으로** 검사한다 — 상태 하나가
 * 정상으로 보여도 다른 하나가 막힌 상태면 로그인을 막아야 한다. 두 값을 하나로
 * 합쳐 검사하면, 나중에 어떤 경로가 status만 되돌리고 deletedAt은 그대로 두는
 * 실수를 해도(예: 소프트 삭제된 계정을 잘못 재활성화) 로그인이 뚫린다 — 이미
 * 한 번 겪은 구멍(status만 보던 시절 admin 플러그인의 banned 체크를 놓쳤던 것)과
 * 같은 모양이라 여기서 반복하지 않는다.
 *
 * auth.ts의 databaseHooks.session.create.before가 이 함수를 부른다. 외부 상태
 * 없는 순수 함수로 떼어 둔 이유는, better-auth 인스턴스(auth.ts)를 통째로
 * 임포트하지 않고도 이 판정 로직만 단위 테스트할 수 있게 하기 위해서다.
 */
export function isLoginBlocked(
  user: { status?: string | null; deletedAt?: Date | null } | null | undefined,
): boolean {
  if (!user) return true;
  return user.status !== "ACTIVE" || user.deletedAt != null;
}
