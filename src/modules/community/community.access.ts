import { isRole } from "@/core/authz/roles";

/**
 * 게시판별 읽기·쓰기 판정. **`can()`이 담지 못하는 권한이다** —
 * `core/authz/can.ts`는 컴파일 시점의 액션×역할 표인데, 이 권한은 게시판마다
 * 다르고 교사가 화면에서 바꾸고 행이 늘어난다.
 *
 * 여기 있는 것은 **순수 함수**다. DB도 세션 조회도 모르고, 커뮤니티 행과 사용자
 * 역할만 본다 — 그래서 판정 표 전체를 DB 없이 테스트할 수 있다.
 *
 * **없앤 게시판인지·지워진 글인지는 여기서 안 본다.** 그것은 행 상태이고,
 * 서비스가 권한 검사 다음에 따로 본다 (`board.service`·`post.service`).
 * 섞으면 이 파일이 순수하지 않게 된다.
 *
 * 다른 모듈이 이 방식을 따라하면 안 된다 — 역할로 가를 수 있는 권한은 `can()`에 넣는다.
 */

/** 판정에 필요한 것만. 커뮤니티 행 전체를 받지 않는다. */
export type CommunityAccess = {
  readRoles: string[];
  writeRoles: string[];
};

type Actor = { role?: string | null } | null | undefined;

/**
 * ADMIN은 배열과 무관하게 통과한다 — `can()`이 ADMIN을 무조건 통과시키는 것과
 * 같은 규칙이다. 교직원 사이에 권한 차등이 없다는 전제가 여기서도 그대로 선다.
 * 그래서 `readRoles`·`writeRoles`에 ADMIN을 넣을 자리를 아예 두지 않는다.
 */
function allows(actor: Actor, roles: string[]): boolean {
  const role = actor?.role;
  if (!isRole(role)) return false;
  if (role === "ADMIN") return true;
  return roles.includes(role);
}

export function canRead(actor: Actor, community: CommunityAccess): boolean {
  return allows(actor, community.readRoles);
}

export function canWrite(actor: Actor, community: CommunityAccess): boolean {
  return allows(actor, community.writeRoles);
}
