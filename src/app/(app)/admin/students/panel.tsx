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

export async function StudentsPanel() {
  const actor = await requirePermission("student:manage");

  const years = await listYears(actor);

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

  const currentYear = years.find((y) => y.isCurrent)?.year;

  return (
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
