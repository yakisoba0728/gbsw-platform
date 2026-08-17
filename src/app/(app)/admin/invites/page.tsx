import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { formatDate } from "@/lib/datetime";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { formatInviteCode } from "@/lib/invite-code";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { studentInviteMetaSchema } from "@/modules/invites/invite.schema";
import {
  listInvites,
  listStudentsForInvite,
} from "@/modules/invites/invite.service";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { InviteForm, type StudentOption } from "./invite-form";
import { InviteTable, type InviteRow } from "./invite-table";

export const metadata: Metadata = { title: "초대 관리" };

type Listed = Awaited<ReturnType<typeof listInvites>>[number];

function classLabel(
  grade: number | null | undefined,
  classNo: number | null | undefined,
  number: number | null | undefined,
): string | null {
  if (grade == null || classNo == null) return null;
  return `${grade}학년 ${classNo}반${number == null ? "" : ` ${number}번`}`;
}

/** DB 행을 화면이 쓸 형태로 눕힌다. metadata 원본은 클라이언트로 내보내지 않는다. */
function toRow(invite: Listed): InviteRow {
  const base = {
    id: invite.id,
    code: formatInviteCode(invite.code),
    role: invite.role,
    roleLabel: isRole(invite.role) ? ROLE_LABELS[invite.role] : invite.role,
    status: invite.status,
    createdAt: formatDate(invite.createdAt),
    expiresAt: invite.expiresAt ? formatDate(invite.expiresAt) : null,
    usedByName: invite.usedBy?.name ?? null,
  };

  if (invite.role === "STUDENT") {
    const meta = studentInviteMetaSchema.safeParse(invite.metadata);
    return {
      ...base,
      name: meta.success ? meta.data.name : "—",
      classLabel: meta.success
        ? classLabel(meta.data.grade, meta.data.classNo, meta.data.number)
        : null,
      birthDate: meta.success ? meta.data.birthDate : null,
      childName: null,
    };
  }

  if (invite.role === "PARENT") {
    const meta = invite.metadata as { name?: string } | null;
    const child = invite.student;
    const childEnrollment = child?.enrollments[0];
    return {
      ...base,
      name: meta?.name ?? "—",
      classLabel: classLabel(
        childEnrollment?.schoolClass?.grade,
        childEnrollment?.schoolClass?.classNo,
        childEnrollment?.number,
      ),
      birthDate: null,
      childName: child?.user.name ?? null,
    };
  }

  const meta = invite.metadata as { name?: string } | null;
  return {
    ...base,
    name: meta?.name ?? "—",
    classLabel: null,
    birthDate: null,
    childName: null,
  };
}

export default async function InvitesPage() {
  const actor = await requirePermission("invite:list");

  // 둘 다 getCurrentYear()를 부른다. 현재 학년도가 없으면 안내 화면으로 떨어뜨린다.
  let data: {
    invites: Awaited<ReturnType<typeof listInvites>>;
    students: Awaited<ReturnType<typeof listStudentsForInvite>>;
  } | null = null;
  try {
    const [invites, students] = await Promise.all([
      listInvites(actor),
      listStudentsForInvite(actor),
    ]);
    data = { invites, students };
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  if (!data) return <NoAcademicYearNotice />;
  const { invites, students } = data;

  const options: StudentOption[] = students.map((s) => {
    const enrollment = s.enrollments[0];
    const where = classLabel(
      enrollment?.schoolClass?.grade,
      enrollment?.schoolClass?.classNo,
      enrollment?.number,
    );
    const label = `${where ?? "미배정"} ${s.user.name}`;
    return { id: s.id, label, search: label.toLowerCase() };
  });

  return (
    // 두 단이 서는 기준은 뷰포트가 아니라 이 자리의 폭이다.
    <div className="@container mx-auto max-w-7xl">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @2xl:grid-cols-[360px_1fr]">
        <InviteForm students={options} />
        <InviteTable rows={invites.map(toRow)} />
      </div>
    </div>
  );
}
