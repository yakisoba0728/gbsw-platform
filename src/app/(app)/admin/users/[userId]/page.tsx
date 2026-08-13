import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/core/auth/session";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { formatDate, formatDateInput, formatDateTime } from "@/lib/datetime";
import {
  AdminUserError,
  getUserDetail,
} from "@/modules/admin-users/admin-user.service";
import {
  EditUserForm,
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
  const cls = profile?.schoolClass;
  const active = user.status === "ACTIVE";

  const editable: EditableUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isStudent: profile != null,
    birthDate: profile ? formatDateInput(profile.birthDate) : "",
    grade: cls ? String(cls.grade) : "",
    classNo: cls ? String(cls.classNo) : "",
    number: profile?.number == null ? "" : String(profile.number),
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

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-5">
          <section className="rounded-card border border-line bg-surface p-5 lg:p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-xl font-extrabold text-ink">{user.name}</h1>
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

              {profile && (
                <>
                  <Field label="소속">
                    {cls
                      ? `${cls.grade}학년 ${cls.classNo}반${
                          profile.number == null ? "" : ` ${profile.number}번`
                        }`
                      : "미배정"}
                  </Field>
                  <Field label="생년월일">
                    {formatDateInput(profile.birthDate)}
                  </Field>
                </>
              )}

              {user.parentLinks.length > 0 && (
                <Field label="자녀">
                  {user.parentLinks
                    .map((link) => {
                      const c = link.student.schoolClass;
                      const where = c
                        ? `${c.grade}-${c.classNo}${
                            link.student.number == null
                              ? ""
                              : ` ${link.student.number}번`
                          }`
                        : "미배정";
                      return `${link.student.user.name} (${where})`;
                    })
                    .join(", ")}
                </Field>
              )}
            </dl>
          </section>

          <section className="rounded-card border border-line bg-surface">
            <header className="border-b border-line px-5 py-4">
              <h2 className="text-base font-extrabold text-ink">활동 기록</h2>
              <p className="mt-0.5 text-[12px] text-mut">
                이 사용자가 한 일과, 이 사용자를 대상으로 한 일 최근 20건
              </p>
            </header>

            {audit.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-mut">
                기록이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-line2">
                {audit.map((entry) => (
                  <li key={entry.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-semibold text-ink">
                        {entry.action}
                      </span>
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
                        : `${entry.actor.name} 실행`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="grid content-start gap-5">
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
