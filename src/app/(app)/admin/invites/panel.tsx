import { Suspense } from "react";
import { requirePermission } from "@/core/auth/session";
import { formatDate } from "@/lib/datetime";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { formatInviteCode, isInviteUsable } from "@/lib/invite-code";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { studentInviteMetaSchema } from "@/modules/invites/invite.schema";
import {
  listInvites,
  listStudentsForInvite,
} from "@/modules/invites/invite.service";
import { cardClass } from "@/components/ui/card";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { formatSeat } from "@/lib/student-number";
import {
  Skeleton,
  SkeletonField,
  SkeletonScreen,
  SkeletonTabs,
} from "@/components/ui/skeleton";
import { type PickerStudent } from "@/components/students/student-picker";
import { InviteForm } from "./invite-form";
import { InviteTable, type InviteRow } from "./invite-table";

type Listed = Awaited<ReturnType<typeof listInvites>>[number];

function classLabel(
  grade: number | null | undefined,
  classNo: number | null | undefined,
  number: number | null | undefined,
): string | null {
  return formatSeat({
    grade: grade ?? null,
    classNo: classNo ?? null,
    number: number ?? null,
  });
}

function toRow(invite: Listed): InviteRow {
  const base = {
    id: invite.id,
    code: formatInviteCode(invite.code),
    role: invite.role,
    roleLabel: isRole(invite.role) ? ROLE_LABELS[invite.role] : invite.role,
    status: invite.status,
    usable: isInviteUsable(invite),
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
        childEnrollment?.grade,
        childEnrollment?.classNo,
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

export async function InvitesPanel() {
  const actor = await requirePermission("invite:list");

  const invitesPromise = listInvites(actor);
  invitesPromise.catch(() => {});

  let students: Awaited<ReturnType<typeof listStudentsForInvite>>;
  try {
    students = await listStudentsForInvite(actor);
  } catch (error) {
    if (error instanceof AcademicYearError) return <NoAcademicYearNotice />;
    throw error;
  }

  const options: PickerStudent[] = students.map((s) => {
    const enrollment = s.enrollments[0];
    return {
      id: s.id,
      name: s.user.name,
      grade: enrollment?.grade ?? null,
      classNo: enrollment?.classNo ?? null,
      number: enrollment?.number ?? null,
    };
  });

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @6xl:grid-cols-[360px_1fr]">
        <InviteForm students={options} />
        <Suspense fallback={<InviteListSkeleton />}>
          <InviteList promise={invitesPromise} />
        </Suspense>
      </div>
    </>
  );
}

async function InviteList({
  promise,
}: {
  promise: ReturnType<typeof listInvites>;
}) {
  let invites: Awaited<ReturnType<typeof listInvites>>;
  try {
    invites = await promise;
  } catch (error) {
    if (error instanceof AcademicYearError) return <NoAcademicYearNotice />;
    throw error;
  }

  return <InviteTable rows={invites.map(toRow)} />;
}

function InviteListSkeleton() {
  return (
    <SkeletonScreen className={cardClass("flush", "min-w-0")}>
      <div className="border-b border-line px-5 py-4">
        <Skeleton className="h-5 w-24 rounded-btn" />
        <SkeletonTabs count={8} size="sm" className="mt-3 flex-wrap" />
        <SkeletonField size="sm" className="mt-2.5" />
      </div>
      <div className="space-y-3 px-5 py-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-6 rounded-btn" />
        ))}
      </div>
    </SkeletonScreen>
  );
}
