import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePermission } from "@/core/auth/session";
import {
  AcademicYearError,
  listYears,
} from "@/modules/academic-year/academic-year.service";
import { listStudents } from "@/modules/enrollment/enrollment.service";
import { StudentTable, type StudentRow } from "./student-table";
import { YearSwitcher } from "./year-switcher";

/**
 * 학생 탭 — 학년도 전환 + 재적(학년·반·번호·재학상태) 편집.
 *
 * 예전 `/admin/students` 화면의 본문 그대로다.
 */
export async function StudentsPanel() {
  const actor = await requirePermission("student:manage");

  const years = await listYears(actor);

  // 현재 학년도가 없으면 표는 못 그리지만 학년도 카드는 띄워야 한다 — 학년도를
  // 지정할 수 있는 화면이 여기뿐이다.
  let rows: StudentRow[] | null = null;
  try {
    const students = await listStudents(actor);
    rows = students.map((s) => ({
      studentProfileId: s.studentProfileId,
      enrollmentUpdatedAt: s.enrollmentUpdatedAt?.toISOString() ?? null,
      name: s.name,
      email: s.email,
      grade: s.grade,
      classNo: s.classNo,
      number: s.number,
      status: s.status,
      accountActive: s.accountActive,
    }));
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  // 학년도가 바뀌면 표를 새로 마운트한다 — 안 그러면 이전 학년도의 편집 상태가
  // 새 목록 위에 남는다.
  const currentYear = years.find((y) => y.isCurrent)?.year;

  return (
    // grid로 두면 암시적 열이 max-content라 표의 minWidth가 페이지를 밀어낸다.
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Link
          href="/admin/students/import"
          className="text-caption font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          명단 반영
        </Link>
      </div>
      <YearSwitcher years={years} />
      {rows && currentYear !== undefined ? (
        <StudentTable key={currentYear} rows={rows} year={currentYear} />
      ) : (
        <EmptyState>
          현재 학년도가 없습니다. 위에서 학년도를 만들거나 고르세요.
        </EmptyState>
      )}
    </div>
  );
}
