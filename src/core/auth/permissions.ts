import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);

// better-auth admin 플러그인 엔드포인트(impersonate·set-role·ban·list-users 등)는
// 앱이 쓰지 않는다. 인증 API는 route.ts의 allowlist로 막지만, allowlist가
// 누락되더라도 대리로그인 같은 계정 조작이 불가능하도록 ADMIN 역할 자체에
// 어떤 문장도 부여하지 않는다. get-session·sign-out은 권한 검사가 없어
// 기능 회귀는 없다.
export const adminRoles = {
  ADMIN: ac.newRole({ user: [], session: [] }),
  STUDENT: ac.newRole({ user: [], session: [] }),
  PARENT: ac.newRole({ user: [], session: [] }),
};
