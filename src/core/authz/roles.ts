export const ROLES = ["ADMIN", "STUDENT", "PARENT"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "교사",
  STUDENT: "학생",
  PARENT: "학부모",
};

export function honorificSuffix(role: Role | null | undefined): string {
  if (role === "ADMIN") return " 선생님";
  if (role === "PARENT") return " 학부모님";
  return "님";
}

export function honorificName(
  name: string,
  role: Role | null | undefined,
): string {
  return `${name}${honorificSuffix(role)}`;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
