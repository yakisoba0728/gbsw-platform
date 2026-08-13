import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  AcademicYearError,
  listYears,
} from "@/modules/academic-year/academic-year.service";
import { listStudents } from "@/modules/enrollment/enrollment.service";
import { StudentTable, type StudentRow } from "./student-table";
import { YearSwitcher } from "./year-switcher";

export const metadata: Metadata = { title: "학생 관리" };

export default async function StudentsPage() {
  const actor = await requirePermission("student:manage");

  const years = await listYears(actor);

  // 현재 학년도가 아예 없으면 listStudents(→getCurrentYear)가 던진다. 그렇다고
  // 화면 전체를 에러 페이지로 넘기면 학년도를 지정할 유일한 화면(YearSwitcher)에도
  // 못 들어간다 — 표 없이 YearSwitcher만이라도 띄운다 (M4).
  let rows: StudentRow[] | null = null;
  try {
    const students = await listStudents(actor);
    rows = students.map((s) => ({
      studentProfileId: s.studentProfileId,
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

  // 학년도가 바뀌면 표를 통째로 새로 마운트한다 — 그대로 두면 클라이언트가
  // 들고 있던 이전 학년도의 편집 상태(drafts)가 새 rows 위에 남아
  // 존재하지 않는 소속이 편집 중인 것처럼 보인다.
  const currentYear = years.find((y) => y.isCurrent)?.year;

  return (
    <div className="grid gap-5">
      <div className="flex justify-end">
        <Link
          href="/admin/students/import"
          className="text-[12.5px] font-semibold text-pri hover:underline"
        >
          명단 올리기
        </Link>
      </div>
      <YearSwitcher years={years} />
      {rows && currentYear !== undefined && (
        <StudentTable key={currentYear} rows={rows} year={currentYear} />
      )}
    </div>
  );
}
