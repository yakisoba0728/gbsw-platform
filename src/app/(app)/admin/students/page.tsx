import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { listStudents } from "@/modules/enrollment/enrollment.service";
import { StudentTable, type StudentRow } from "./student-table";

export const metadata: Metadata = { title: "학생 관리" };

export default async function StudentsPage() {
  const actor = await requirePermission("student:manage");
  const students = await listStudents(actor);

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

  return (
    <div className="grid gap-5">
      <StudentTable rows={rows} />
    </div>
  );
}
