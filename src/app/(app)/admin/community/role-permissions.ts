import { ROLES, type Role } from "@/core/authz/roles";

export const COMMUNITY_ASSIGNABLE_ROLES: readonly Role[] = ROLES.filter(
  (role) => role !== "ADMIN",
);

export type CommunityRolePermissions = {
  readRoles: Role[];
  writeRoles: Role[];
};

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
