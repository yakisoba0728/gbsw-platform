import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { formatDate } from "@/lib/datetime";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { listUsers } from "@/modules/admin-users/admin-user.service";
import { UserTable, type UserRow } from "./user-table";

export const metadata: Metadata = { title: "사용자 관리" };

export default async function UsersPage() {
  const actor = await requirePermission("user:manage");
  const users = await listUsers(actor);

  const rows: UserRow[] = users.map((u) => {
    const enrollment = u.studentProfile?.enrollments[0];
    const cls = enrollment?.schoolClass;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role ?? "",
      roleLabel: isRole(u.role) ? ROLE_LABELS[u.role] : "역할 미지정",
      active: u.status === "ACTIVE",
      mustChangePassword: u.mustChangePassword ?? false,
      classLabel: cls
        ? `${cls.grade}학년 ${cls.classNo}반${
            enrollment?.number == null ? "" : ` ${enrollment.number}번`
          }`
        : null,
      createdAt: formatDate(u.createdAt),
      isSelf: u.id === actor.id,
    };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <UserTable rows={rows} />
    </div>
  );
}
