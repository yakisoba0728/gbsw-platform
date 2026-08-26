import { Suspense } from "react";
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
import { cardClass } from "@/components/ui/card";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { formatSeat } from "@/lib/student-number";
import {
  Skeleton,
  SkeletonField,
  SkeletonScreen,
  SkeletonTabs,
} from "@/components/ui/skeleton";
import { InviteForm, type StudentOption } from "./invite-form";
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

/**
 * 초대 탭 — 초대코드 발급 + 발급 내역.
 *
 * 예전 `/admin/invites` 화면의 본문 그대로다. 두 단으로 서는 기준이 되는
 * `@container`는 page.tsx가 갖는다.
 */
export async function InvitesPanel() {
  const actor = await requirePermission("invite:list");

  // 목록 조회는 시작만 하고 기다리지 않는다. 기다리면 이 함수 전체가 멈춰서 발급 폼까지
  // 함께 뼈대가 된다 — 글자를 넣던 폼이 사라지는 것이 이 화면에서 가장 나쁜 일이다.
  const invitesPromise = listInvites(actor);
  // 아래 학년도 안내로 빠지면 이 약속을 아무도 기다리지 않는다. 받는 곳 없는 거절은
  // 요청을 통째로 무너뜨리므로 여기서 미리 받아 둔다 — 자식의 await는 그대로 거절을 본다.
  invitesPromise.catch(() => {});

  // 학생 목록은 조회 결과가 아니라 발급 폼의 재료다 — 경계 밖에 서므로 여기서 기다린다.
  // listStudentsForInvite도 getCurrentYear()를 부르니 현재 학년도가 없으면 안내로 떨어진다.
  let students: Awaited<ReturnType<typeof listStudentsForInvite>>;
  try {
    students = await listStudentsForInvite(actor);
  } catch (error) {
    if (error instanceof AcademicYearError) return <NoAcademicYearNotice />;
    throw error;
  }

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
    <>
      {/*
        @6xl(1152px)부터 두 단이다. @2xl(672px)로 두었더니 오른쪽 칸이 296px인데
        목록 표는 680px을 요구해, 그 사이 폭에서는 표의 오른쪽 절반이 반드시
        잘렸다 — 왼쪽 폼 아래는 비어 있는 채로.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @6xl:grid-cols-[360px_1fr]">
        <InviteForm students={options} />
        {/* key를 주지 않는다. 발급·폐기 뒤 revalidate에서도 이 경계가 다시 매달리는데,
            key가 있으면 그때마다 목록이 뼈대로 깜빡인다 — 지금은 새 목록이 닿을 때까지
            옛 목록이 그대로 서 있는다. */}
        <Suspense fallback={<InviteListSkeleton />}>
          <InviteList promise={invitesPromise} />
        </Suspense>
      </div>
    </>
  );
}

/** 목록. 조건이 없는 화면이라 늦게 와도 되는 것은 이것뿐이다. */
async function InviteList({
  promise,
}: {
  promise: ReturnType<typeof listInvites>;
}) {
  // 학년도가 조회 도중에 사라지면 거절이 여기로 온다. 경계 밖으로 새면 error.tsx가 받아
  // 화면 전체가 오류가 되므로 이 칸에서 안내로 받는다.
  let invites: Awaited<ReturnType<typeof listInvites>>;
  try {
    invites = await promise;
  } catch (error) {
    if (error instanceof AcademicYearError) return <NoAcademicYearNotice />;
    throw error;
  }

  return <InviteTable rows={invites.map(toRow)} />;
}

/**
 * 목록 자리. loading.tsx의 오른쪽 칸과 같은 짜임이라 내용이 도착할 때 안 튄다.
 * 이때 폼은 이미 서 있어 뼈대는 이 칸뿐이므로, "불러오는 중"도 여기서만 알린다.
 */
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
