import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { requirePermission } from "@/core/auth/session";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { formatDate, formatDateInput, formatDateTime } from "@/lib/datetime";
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
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/users"
        className="mb-3 inline-flex items-center gap-1 text-caption font-medium text-mut transition-colors hover:text-ink"
      >
        <ChevronLeftIcon size={15} />
        계정 목록
      </Link>

      {/* 카드가 두 규격이다. SectionCard는 머리글 띠를 가진 내용 섹션(활동 기록),
          테두리 한 겹은 폼·안내 패널(정보 수정·계정 조치·완전 삭제)이다. */}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-5">
          <section className="rounded-card border border-line bg-surface p-5 lg:p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* h1은 상단바가 모든 화면에 이미 그린다. */}
              <h2 className="text-title font-semibold text-ink">{user.name}</h2>
              {deleted && <Badge tone="rejected">삭제됨</Badge>}
              <Badge tone={active ? "approved" : "cancelled"}>
                {active ? "활성" : "비활성"}
              </Badge>
              {user.mustChangePassword && (
                <Badge tone="pending">비밀번호 변경 대기</Badge>
              )}
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="이메일">{user.email}</Field>
              <Field label="역할">
                {isRole(user.role) ? ROLE_LABELS[user.role] : "역할 미지정"}
              </Field>
              <Field label="전화번호">{user.phone ?? "—"}</Field>
              <Field label="가입일">{formatDate(user.createdAt)}</Field>
              {deleted && user.deletedAt && (
                <Field label="명단 제외일">{formatDate(user.deletedAt)}</Field>
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
                      href={`/merit/students/${profile.id}`}
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
                      const where = c
                        ? `${c.grade}-${c.classNo}${
                            e?.number == null ? "" : ` ${e.number}번`
                          }`
                        : "미배정";
                      return `${link.student.user.name} (${where})`;
                    })
                    .join(", ")}
                </Field>
              )}
            </dl>
          </section>

          <SectionCard
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
                      <span className="font-mono text-xs text-mut">
                        {formatDateTime(entry.createdAt)}
                      </span>
                      {entry.ip && (
                        <span className="font-mono text-xs text-mut2">{entry.ip}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-mut">
                      {entry.actorUserId === user.id
                        ? "본인이 실행"
                        : `${entry.actorName} 실행`}
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

        <div className="grid content-start gap-5">
          {deleted ? (
            <>
              <section className="rounded-card border border-line bg-surface p-5">
                <h2 className="mb-1 text-lg font-semibold text-ink">
                  명단에서 빠진 계정
                </h2>
                {/* 이번 학년도 소속은 실제로 지워진다. 자퇴·전출은 학적 칸으로 남긴다. */}
                <p className="text-caption text-mut">
                  정보 수정·비밀번호 초기화·활성화를 할 수 없습니다. 계정과 학생
                  정보, 지난 학년도 소속, 상벌점 기록은 남지만 이번 학년도 소속은
                  사라집니다. 다음 명단 반영에 다시 포함되면 되살아납니다.
                </p>
              </section>

              {/* 되돌릴 수 없는 유일한 동작이라 다른 조치와 섞지 않는다. */}
              <section className="rounded-card border border-rose-line bg-surface p-5">
                <h2 className="mb-1 text-lg font-semibold text-rose">완전 삭제</h2>
                <HardDeleteForm user={editable} />
              </section>
            </>
          ) : (
            <>
              <section className="rounded-card border border-line bg-surface p-5">
                <h2 className="mb-4 text-lg font-semibold text-ink">정보 수정</h2>
                <EditUserForm user={editable} />
              </section>

              <section className="rounded-card border border-line bg-surface p-5">
                <h2 className="mb-1 text-lg font-semibold text-ink">계정 조치</h2>
                <p className="mb-4 text-caption text-mut">
                  둘 다 로그인 세션을 끊습니다.
                </p>
                <div className="grid gap-2.5">
                  <ResetPasswordForm user={editable} />
                  <ToggleActiveForm user={editable} />
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-mut">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
