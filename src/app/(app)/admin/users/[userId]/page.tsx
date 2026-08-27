import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { requirePermission } from "@/core/auth/session";
import { honorificName, isRole, ROLE_LABELS } from "@/core/authz/roles";
import { formatDate, formatDateInput, formatDateTime } from "@/lib/datetime";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { formatSeat } from "@/lib/student-number";
import {
  AdminUserError,
  getUserDetail,
} from "@/modules/admin-users/admin-user.service";
import {
  auditActionLabel,
  auditActionTone,
  formatAuditMetadata,
} from "@/modules/audit-log/audit-log.labels";
import {
  EditUserForm,
  HardDeleteForm,
  ResetPasswordForm,
  ToggleActiveForm,
  type EditableUser,
} from "./user-forms";

export const metadata: Metadata = { title: "계정 상세" };

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const actor = await requirePermission("user:manage");
  const { userId } = await params;

  let detail;
  try {
    detail = await getUserDetail(actor, userId);
  } catch (error) {
    if (error instanceof AdminUserError) notFound();
    // getUserDetail도 getCurrentYear()를 부른다. 현재 학년도가 없으면 목록 화면과
    // 같은 안내로 떨어뜨린다 — 여기만 오류 화면이 뜰 이유가 없다.
    if (error instanceof AcademicYearError) return <NoAcademicYearNotice />;
    throw error;
  }

  const { user, audit } = detail;
  const profile = user.studentProfile;
  const enrollment = profile?.enrollments[0];
  const cls = enrollment?.schoolClass;
  const active = user.status === "ACTIVE";
  const deleted = user.deletedAt !== null;

  const editable: EditableUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    updatedAt: user.updatedAt.toISOString(),
    isStudent: profile != null,
    // 재학 중일 때만 학년·반·번호를 이 화면에서 고칠 수 있다.
    canEditAssignment: enrollment?.status === "ENROLLED",
    birthDate: profile ? formatDateInput(profile.birthDate) : "",
    grade: cls ? String(cls.grade) : "",
    classNo: cls ? String(cls.classNo) : "",
    number: enrollment?.number == null ? "" : String(enrollment.number),
    active,
    isSelf: user.id === actor.id,
  };

  return (
    <div className="@container mx-auto max-w-5xl">
      <BackLink href="/admin/users" className="mb-3">
        계정 목록
      </BackLink>

      {/* 카드가 두 규격이다. SectionCard는 머리글 띠를 가진 내용 섹션(활동 기록),
          variant="panel"은 테두리 한 겹짜리 폼·안내 패널이다. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @2xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <section className={cardClass("panel", "@container")}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* h1은 상단바가 모든 화면에 이미 그린다. */}
              <h2 className="text-title font-semibold text-ink">
                {honorificName(user.name, isRole(user.role) ? user.role : null)}
              </h2>
              {deleted && <Badge tone="rejected">삭제됨</Badge>}
              <Badge tone={active ? "approved" : "cancelled"}>
                {active ? "활성" : "비활성"}
              </Badge>
              {user.mustChangePassword && (
                <Badge tone="pending">비밀번호 변경 대기</Badge>
              )}
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm @md:grid-cols-2">
              <Field label="이메일">{user.email}</Field>
              <Field label="역할">
                {isRole(user.role) ? ROLE_LABELS[user.role] : "역할 미지정"}
              </Field>
              <Field label="전화번호">{user.phone ?? "—"}</Field>
              <Field label="가입일">{formatDate(user.createdAt)}</Field>
              {deleted && user.deletedAt && (
              <Field label="삭제 표시일">{formatDate(user.deletedAt)}</Field>
              )}

              {profile && (
                <>
                  <Field label="소속">
                    {cls
                      ? `${cls.grade}학년 ${cls.classNo}반${
                          enrollment?.number == null
                            ? ""
                            : ` ${enrollment.number}번`
                        }`
                      : "미배정"}
                  </Field>
                  <Field label="생년월일">
                    {formatDateInput(profile.birthDate)}
                  </Field>
                  {/* 상벌점 검색은 재학생만 보여주므로 명단에서 빠진 학생은
                      이 링크로만 갈 수 있다. */}
                  <Field label="상벌점">
                    <Link
                      href={`/students/${profile.id}`}
                      className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                    >
                      내역 보기
                    </Link>
                  </Field>
                </>
              )}

              {user.parentLinks.length > 0 && (
                <Field label="자녀">
                  {user.parentLinks
                    .map((link) => {
                      const e = link.student.enrollments[0];
                      const c = e?.schoolClass;
                      const where =
                        formatSeat({
                          grade: c?.grade ?? null,
                          classNo: c?.classNo ?? null,
                          number: e?.number ?? null,
                        }) ?? "미배정";
                      return `${honorificName(link.student.user.name, "STUDENT")} (${where})`;
                    })
                    .join(", ")}
                </Field>
              )}
            </dl>
          </section>

          <SectionCard
            headingLevel={3}
            title="활동 기록"
            hint="이 계정이 한 일과 이 계정을 대상으로 한 일 최근 20건"
            flush
          >
            {audit.length === 0 ? (
              <EmptyState variant="inside">기록이 없습니다.</EmptyState>
            ) : (
              <ul className="divide-y divide-line2">
                {audit.map((entry) => (
                  <li key={entry.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <Badge tone={auditActionTone(entry.action)}>
                        {auditActionLabel(entry.action)}
                      </Badge>
                      <span className="text-xs tabular-nums text-mut">
                        {formatDateTime(entry.createdAt)}
                      </span>
                      {entry.ip && (
                        <span className="font-mono text-xs text-mut2">{entry.ip}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-mut">
                      {/* 무엇을 했는지는 위의 배지가 말한다. 이 줄은 누구인지만 —
                          「실행」을 붙이면 사람이 아니라 기계가 쓴 줄로 읽힌다. */}
                      {entry.actorUserId === user.id
                        ? "본인"
                        : honorificName(
                            entry.actorName,
                            isRole(entry.actor?.role) ? entry.actor.role : null,
                          )}
                      {formatAuditMetadata(entry.action, entry.metadata) && (
                        <span className="block">
                          {formatAuditMetadata(entry.action, entry.metadata)}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-4">
          {deleted ? (
            <>
              <SectionCard
                variant="panel"
                headingLevel={3}
                title="삭제 표시된 계정"
              >
                <p className="text-caption text-mut">
                  예전 명단 제외 기록이 남아 있는 계정입니다. 정보 수정·비밀번호
                  초기화·활성화를 할 수 없습니다.
                </p>
              </SectionCard>

              {profile && (
                <SectionCard
                  variant="panel"
                  tone="danger"
                  headingLevel={3}
                  title="완전 삭제"
                >
                  <HardDeleteForm user={editable} />
                </SectionCard>
              )}
            </>
          ) : (
            <>
              <SectionCard variant="panel" headingLevel={3} title="정보 수정">
                <EditUserForm user={editable} />
              </SectionCard>

              <SectionCard
                variant="panel"
                headingLevel={3}
                title="계정 조치"
                hint="둘 다 로그인 세션을 끊습니다."
              >
                <div className="flex flex-col gap-2.5">
                  <ResetPasswordForm user={editable} />
                  <ToggleActiveForm user={editable} />
                </div>
              </SectionCard>

              {profile && (
                <SectionCard
                  variant="panel"
                  tone="danger"
                  headingLevel={3}
                  title="완전 삭제"
                >
                  <HardDeleteForm user={editable} />
                </SectionCard>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
