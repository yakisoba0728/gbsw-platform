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
import { formatDate, formatDateInput } from "@/lib/datetime";
import { formatStudentNumber } from "@/lib/student-number";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getStudentProfile } from "@/modules/enrollment/enrollment.service";

/**
 * 학생 정보 갈래 — 소속 · 학번 · 생년월일 · 계정.
 *
 * 고치는 자리는 여기가 아니다. 이름·이메일·학급은 계정 상세가 고치고, 명단 전체는
 * 학생 관리가 고친다 — 같은 값을 두 곳에서 고칠 수 있으면 어느 쪽이 최신인지
 * 화면이 답하지 못한다. 여기는 읽고 그쪽으로 보내는 자리다.
 */
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
    // 소속은 그 학년도 재적에서 나온다 — 학년도가 없으면 조회 자체가 못 돈다.
    if (!(error instanceof AcademicYearError)) throw error;
    return <NoAcademicYearNotice />;
  }
  // 머리글이 이미 신원을 확인했으므로 여기까지 와서 없을 일은 사실상 없다.
  if (!profile) notFound();

  const seat = formatStudentNumber(profile);

  return (
    // 카드 안쪽이라 뷰포트가 아니라 놓인 자리의 폭을 본다.
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
        {/* 학번은 해마다 바뀌는 값이라 기록의 식별자가 아니다 — 교사가 외우고
            있는 값이라 적는다. 반이 두 자리면 줄일 수 없어 소속 줄이 답한다. */}
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
        {profile.removedAt && (
          <Field label="명단 제외일">
            <span className="tabular-nums">{formatDate(profile.removedAt)}</span>
          </Field>
        )}
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
