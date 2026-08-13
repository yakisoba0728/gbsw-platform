import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { listYears } from "@/modules/academic-year/academic-year.service";
import { listStudents } from "@/modules/enrollment/enrollment.service";
import { StudentTable, type StudentRow } from "./student-table";
import { YearSwitcher } from "./year-switcher";

export const metadata: Metadata = { title: "학생 관리" };

export default async function StudentsPage() {
  const actor = await requirePermission("student:manage");

  const [students, years] = await Promise.all([
    listStudents(actor),
    listYears(actor),
  ]);

  const rows: StudentRow[] = students.map((s) => ({
    studentProfileId: s.studentProfileId,
    name: s.name,
    email: s.email,
    grade: s.grade,
    classNo: s.classNo,
    number: s.number,
    status: s.status,
    accountActive: s.accountActive,
  }));

  // 학년도가 바뀌면 표를 통째로 새로 마운트한다 — 그대로 두면 클라이언트가
  // 들고 있던 이전 학년도의 편집 상태(drafts)가 새 rows 위에 남아
  // 존재하지 않는 소속이 편집 중인 것처럼 보인다.
  const currentYear = years.find((y) => y.isCurrent)?.year;

  return (
    <div className="grid gap-5">
      <YearSwitcher years={years} />
      <StudentTable key={currentYear} rows={rows} />
    </div>
  );
}
