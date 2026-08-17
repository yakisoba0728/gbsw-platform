import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Better Auth admin 플러그인 전용 — 계정 관리 API 권한만 다룬다.
 * 업무 권한은 core/authz/can.ts 한 곳에서만 판정한다. 두 체계를 섞지 말 것.
 */
export const ac = createAccessControl(defaultStatements);

export const adminRoles = {
  // 계정 관리 전권
  ADMIN: ac.newRole({
    user: [...defaultStatements.user],
    session: [...defaultStatements.session],
  }),
  // 학생·학부모는 계정 관리 API 권한 없음
  STUDENT: ac.newRole({ user: [], session: [] }),
  PARENT: ac.newRole({ user: [], session: [] }),
};
