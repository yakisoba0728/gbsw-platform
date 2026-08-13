import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { formatDate } from "@/lib/datetime";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { formatInviteCode } from "@/lib/invite-code";
import { studentInviteMetaSchema } from "@/modules/invites/invite.schema";
import {
  listInvites,
  listStudentsForInvite,
} from "@/modules/invites/invite.service";
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

/** DB 행을 화면이 그대로 쓸 형태로 눕힌다 (metadata 원본은 클라이언트로 내보내지 않는다). */
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
  const [invites, students] = await Promise.all([
    listInvites(actor),
    listStudentsForInvite(actor),
  ]);

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
    <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[360px_1fr]">
      <InviteForm students={options} />
      <InviteTable rows={invites.map(toRow)} />
    </div>
  );
}
