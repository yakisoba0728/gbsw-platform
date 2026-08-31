import { ROLES, type Role } from "@/core/authz/roles";

/** 교사는 게시판 권한 목록과 무관하게 항상 읽고 쓸 수 있다. */
export const COMMUNITY_ASSIGNABLE_ROLES: readonly Role[] = ROLES.filter(
  (role) => role !== "ADMIN",
);

export type CommunityRolePermissions = {
  readRoles: Role[];
  writeRoles: Role[];
};

/** 서버에서 돌아온 문자열 배열을 화면에서 다룰 수 있는 역할만 남겨 정규화한다. */
export function communityRolePermissions(
  readRoles: readonly string[],
  writeRoles: readonly string[],
): CommunityRolePermissions {
  const write = COMMUNITY_ASSIGNABLE_ROLES.filter((role) => writeRoles.includes(role));
  const read = COMMUNITY_ASSIGNABLE_ROLES.filter(
    (role) => readRoles.includes(role) || write.includes(role),
  );

  return { readRoles: read, writeRoles: write };
}

/**
 * 글쓰기 권한은 읽기 권한의 부분집합이다. 쓰기를 켜면 읽기도 켜고, 읽기를 끄면
 * 쓰기도 끈다. 저장 뒤 서버에서 거절하기 전에 화면 자체가 성립 가능한 조합만 만든다.
 */
export function toggleCommunityRolePermission(
  current: CommunityRolePermissions,
  group: "read" | "write",
  role: Role,
  checked: boolean,
): CommunityRolePermissions {
  const set = (roles: readonly Role[], include: boolean) =>
    COMMUNITY_ASSIGNABLE_ROLES.filter((candidate) =>
      candidate === role ? include : roles.includes(candidate),
    );

  if (group === "write") {
    return {
      readRoles: checked ? set(current.readRoles, true) : [...current.readRoles],
      writeRoles: set(current.writeRoles, checked),
    };
  }

  return {
    readRoles: set(current.readRoles, checked),
    writeRoles: checked ? [...current.writeRoles] : set(current.writeRoles, false),
  };
}
