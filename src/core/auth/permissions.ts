import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Better Auth admin 플러그인 전용 접근제어.
 *
 * 여기서 다루는 건 "계정 관리 API"(목록/정지/비밀번호 초기화/대리로그인) 권한뿐이다.
 * 업무 도메인 권한은 전부 core/authz/can.ts 한 곳에서만 판정한다 — 두 체계를 섞지 말 것.
 *
 * 서버(auth.ts)와 클라이언트(auth-client.ts)가 같은 정의를 공유해야 하므로
 * 별도 파일로 뒀다. 클라이언트 번들에 들어가도 안전한 순수 설정이다.
 */
export const ac = createAccessControl(defaultStatements);

export const adminRoles = {
  // 계정 관리 전권
  ADMIN: ac.newRole({
    user: [...defaultStatements.user],
    session: [...defaultStatements.session],
  }),
  // 학생·학부모는 계정 관리 API 권한 없음 (업무 권한은 can()이 따로 판정)
  STUDENT: ac.newRole({ user: [], session: [] }),
  PARENT: ac.newRole({ user: [], session: [] }),
};
