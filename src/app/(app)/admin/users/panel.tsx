import { requirePermission } from "@/core/auth/session";
import { formatDate } from "@/lib/datetime";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { listUsers } from "@/modules/admin-users/admin-user.service";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { formatSeat } from "@/lib/student-number";
import { UserTable, type UserRow } from "./user-table";

export async function AccountsPanel() {
  const actor = await requirePermission("user:manage");

  let users: Awaited<ReturnType<typeof listUsers>>;
  try {
    users = await listUsers(actor);
  } catch (error) {
    if (error instanceof AcademicYearError) return <NoAcademicYearNotice />;
    throw error;
  }

  const rows: UserRow[] = users.map((u) => {
    const enrollment = u.studentProfile?.enrollments[0];
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role ?? "",
      roleLabel: isRole(u.role) ? ROLE_LABELS[u.role] : "역할 미지정",
      active: u.status === "ACTIVE",
      mustChangePassword: u.mustChangePassword ?? false,
      classLabel: formatSeat({
        grade: enrollment?.grade ?? null,
        classNo: enrollment?.classNo ?? null,
        number: enrollment?.number ?? null,
      }),
      createdAt: formatDate(u.createdAt),
    };
  });

  return <UserTable rows={rows} />;
}
