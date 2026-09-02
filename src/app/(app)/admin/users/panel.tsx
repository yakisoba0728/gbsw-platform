import { requirePermission } from "@/core/auth/session";
import { formatDate } from "@/lib/datetime";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { listUsers } from "@/modules/admin-users/admin-user.service";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { formatSeat } from "@/lib/student-number";
import { UserTable, type UserRow } from "./user-table";

/**
 * 계정 탭 — 전체 계정 목록.
 *
 * 예전 `/admin/users` 화면의 본문 그대로다. 껍데기(폭·제목)는 page.tsx가 갖는다 —
 * 세 탭이 같은 자리에 서므로 폭이 탭마다 다르면 탭을 누를 때마다 화면이 흔들린다.
 */
export async function AccountsPanel() {
  const actor = await requirePermission("user:manage");

  // listUsers도 getCurrentYear()를 부른다. 현재 학년도가 없으면 안내로 떨어뜨린다.
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
