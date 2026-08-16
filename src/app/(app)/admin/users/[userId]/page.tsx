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

export const metadata: Metadata = { title: "사용자 상세" };

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
    // 재학 중일 때만 학년·반·번호를 이 화면에서 고칠 수 있다 (I2).
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
        className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-mut transition-colors hover:text-ink"
      >
        <ChevronLeftIcon size={15} />
        사용자 목록
      </Link>

      {/*
        이 화면에는 카드가 두 규격으로 있다. 섞여 있는 게 아니라 **저장소 전체가
        쓰는 두 종류**다.

        - `<SectionCard>` = 머리글 띠(제목 + 아래 구분선)를 가진 **내용 섹션**.
          목록·표·그래프처럼 "무엇의 모음"을 담는다. 아래 활동 기록이 이쪽이다.
        - `rounded-card … p-5` 한 겹 = **폼/안내 패널**. 제목이 곧 그 폼의 이름이라
          구분선 띠를 두면 340px 옆 칸에서 무게만 늘어난다. year-switcher ·
          rule-form · invite-form · award-form · import-form이 모두 이 규격이고,
          이 화면의 정보 수정·계정 조치·완전 삭제도 같은 종류다.

        맨 위 신원 카드만 예외로 보이는데, 제목이 섹션 이름이 아니라 **사람 이름**
        (text-xl)이라서다 — SectionCard의 text-base 제목으로 내리면 이 화면이
        누구의 화면인지가 활동 기록 제목과 같은 크기가 된다.
      */}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-5">
          <section className="rounded-card border border-line bg-surface p-5 lg:p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* 제목은 h2부터 시작한다 — h1은 상단바가 (app) 모든 화면에 이미 그린다. */}
              <h2 className="text-xl font-extrabold text-ink">{user.name}</h2>
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
                  {/*
                    명단에서 빠진 학생이면 상벌점 검색으로는 못 찾는다 —
                    그쪽은 줄 상대를 고르는 자리라 재학생만 보여준다. 계정을
                    이미 찾아 온 이 화면에서 바로 건너갈 수 있게 둔다.
                  */}
                  <Field label="상벌점">
                    <Link
                      href={`/merit/students/${profile.id}`}
                      className="font-semibold text-pri hover:underline"
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
            hint="이 사용자가 한 일과, 이 사용자를 대상으로 한 일 최근 20건"
            flush
          >
            {audit.length === 0 ? (
              <EmptyState variant="inside">기록이 없습니다.</EmptyState>
            ) : (
              <ul className="divide-y divide-line2">
                {audit.map((entry) => (
                  <li key={entry.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      {/*
                        전에는 `user:reset-password`·`authz:denied` 같은 영문
                        원본을 그대로 그렸다. /admin/logs가 쓰는 라벨 계층을 이
                        화면만 건너뛰고 있었다 — 같은 기록이 화면마다 다르게
                        보이면 관리자가 둘을 같은 일로 읽지 못한다.
                      */}
                      <Badge tone={auditActionTone(entry.action)}>
                        {auditActionLabel(entry.action)}
                      </Badge>
                      <span className="text-[12px] text-mut">
                        {formatDateTime(entry.createdAt)}
                      </span>
                      {entry.ip && (
                        <span className="text-[12px] text-mut2">{entry.ip}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-mut">
                      {entry.actorUserId === user.id
                        ? "본인이 실행"
                        : `${entry.actorName} 실행`}
                      {/* 무엇을 대상으로 한 일인지는 metadata에만 있다 —
                          로그 화면과 같은 포맷터로 함께 보여준다. */}
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
            // 이미 명단에서 빠진 계정이다 — 정보 수정·비밀번호 초기화·활성화는
            // 의미가 없다. 다음 명단에 다시 들어오면 이 계정은 스스로 되살아난다.
            <>
              <section className="rounded-card border border-line bg-surface p-5">
                <h2 className="mb-1 text-base font-extrabold text-ink">
                  명단에서 빠진 계정
                </h2>
                {/*
                  소프트 삭제는 그 학년도 Enrollment를 **실제로 지운다**
                  (roster.repo의 enrollment.deleteMany). 전에는 "학적·소속·기록은
                  그대로 남아 있으며"라고 적어 있었는데, 이번 학년도 소속만은
                  사실이 아니었다. 자퇴·전출을 기록하는 올바른 방법은 명단에서
                  줄을 지우는 게 아니라 학적 칸을 바꾸는 것이다.
                */}
                <p className="text-[12.5px] text-mut">
                  정보 수정·비밀번호 초기화·활성화를 할 수 없습니다. 계정과 학생
                  정보, 지난 학년도 소속, 상벌점 기록은 그대로 남지만 이번 학년도
                  소속은 사라집니다. 다음 명단 반영에 이 학생이 다시 포함되면
                  계정이 자동으로 되살아납니다.
                </p>
              </section>

              {/* 오등록 정리용 완전 삭제 — 소프트 삭제된 계정에만 보인다.
                  되돌릴 수 없는 유일한 동작이라 다른 계정 조치와 섞이지 않게
                  따로 둔다. */}
              <section className="rounded-card border border-rose-line bg-surface p-5">
                <h2 className="mb-1 text-base font-extrabold text-rose">
                  완전 삭제
                </h2>
                <HardDeleteForm user={editable} />
              </section>
            </>
          ) : (
            <>
              <section className="rounded-card border border-line bg-surface p-5">
                <h2 className="mb-4 text-base font-extrabold text-ink">정보 수정</h2>
                <EditUserForm user={editable} />
              </section>

              <section className="rounded-card border border-line bg-surface p-5">
                <h2 className="mb-1 text-base font-extrabold text-ink">계정 조치</h2>
                <p className="mb-4 text-[12px] text-mut">
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
      <dt className="text-[11.5px] font-semibold text-mut">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
