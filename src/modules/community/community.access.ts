import { isRole } from "@/core/authz/roles";

type CommunityAccess = {
  readRoles: string[];
  writeRoles: string[];
};

type Actor = { role?: string | null } | null | undefined;

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
