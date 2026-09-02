import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cardClass } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";
import type { SessionUser } from "@/core/auth/session";
import {
  ENROLLMENT_STATUS_LABELS,
  isEnrollmentStatus,
} from "@/core/authz/enrollment-status";
import { formatDateInput } from "@/lib/datetime";
import { formatStudentNumber } from "@/lib/student-number";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getStudentProfile } from "@/modules/enrollment/enrollment.service";

export function ProfileTab({
  actor,
  studentId,
}: {
  actor: SessionUser;
  studentId: string;
}) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileBody actor={actor} studentId={studentId} />
    </Suspense>
  );
}

function ProfileSkeleton() {
  return (
    <SkeletonScreen className="space-y-4">
      <div className={cardClass("panel")}>
        <div className="grid gap-x-6 gap-y-3 @md:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-32" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}

async function ProfileBody({
  actor,
  studentId,
}: {
  actor: SessionUser;
  studentId: string;
}) {
  let profile;
  try {
    profile = await getStudentProfile(actor, studentId);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return <NoAcademicYearNotice />;
  }
  if (!profile) notFound();

  const seat = formatStudentNumber(profile);

  return (
    <section className={cardClass("panel", "@container")}>
      <dl className="grid gap-x-6 gap-y-3 text-sm @md:grid-cols-2">
        <Field label="소속">
          {profile.grade !== null && profile.classNo !== null
            ? `${profile.grade}학년 ${profile.classNo}반${
                profile.number === null ? "" : ` ${profile.number}번`
              }`
            : "미배정"}
        </Field>
        <Field label="학적">
          {isEnrollmentStatus(profile.status)
            ? ENROLLMENT_STATUS_LABELS[profile.status]
            : "재적 없음"}
        </Field>
        <Field label="학번">
          {seat ? <span className="tabular-nums">{seat}</span> : "—"}
        </Field>
        <Field label="학생코드">
          <span className="font-mono">{profile.studentCode}</span>
        </Field>
        <Field label="생년월일">
          <span className="tabular-nums">{formatDateInput(profile.birthDate)}</span>
        </Field>
        <Field label="이메일">{profile.email}</Field>
        <Field label="계정">
          <Link
            href={`/admin/users/${profile.userId}`}
            className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
          >
            계정 상세
          </Link>
        </Field>
      </dl>
    </section>
  );
}
