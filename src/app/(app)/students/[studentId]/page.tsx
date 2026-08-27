import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { ForbiddenError } from "@/core/authz/errors";
import { honorificName, isRole } from "@/core/authz/roles";
import { EnrollmentTag } from "@/components/merit/enrollment-tag";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { ChipLink } from "@/components/ui/chip-link";
import { SectionCard } from "@/components/ui/section-card";
import type { SearchParamsInput } from "@/lib/search-params";
import { formatStudentNumber } from "@/lib/student-number";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getStudentIdentity } from "@/modules/enrollment/enrollment.service";
import { MeritTab } from "./merit-tab";
import { PassTab } from "./pass-tab";
import { ProfileTab } from "./profile-tab";
import {
  STUDENT_TABS,
  STUDENT_TAB_ACTIONS,
  STUDENT_TAB_LABELS,
  parseStudentTab,
  studentHref,
  studentTabParam,
  type StudentTab,
} from "./student-tab";

/**
 * 탭 제목은 갈래를 따라가지 않는다 — 같은 경로에서 쿼리만 바뀌는 이동이라
 * 라우터가 캐시된 제목을 그대로 쓴다(`merit/stats/page.tsx`에 같은 기록이 있다).
 * 지금 보는 갈래는 화면 안의 켜진 칩이 답한다.
 */
export const metadata: Metadata = { title: "학생" };

type Identity = Awaited<ReturnType<typeof getStudentIdentity>>;

/**
 * 한 학생을 보는 자리 — 상벌점 · 출입증 · 학생 정보.
 *
 * 머리글(이름·학생코드·소속·학적)은 탭 위에 한 번만 선다. 탭을 옮겨도 흔들리지
 * 않아야 한다: 흔들리면 같은 사람을 보고 있다는 사실이 화면에서 끊긴다.
 */
export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAuth();

  const { studentId } = await params;
  const raw = (await searchParams) as SearchParamsInput;

  // 볼 수 있는 갈래만 남긴다. 이 분기는 접근 통제가 아니라 화면 선택이다 —
  // 실제로 막는 것은 각 탭이 부르는 서비스의 can() 검사다.
  const visible = STUDENT_TABS.filter((tab) => can(actor, STUDENT_TAB_ACTIONS[tab]));
  const requested = parseStudentTab(raw.tab);
  // 못 보는 갈래를 주소로 찍어 들어오면 볼 수 있는 첫 갈래로 떨어진다.
  const tab: StudentTab = visible.includes(requested) ? requested : (visible[0] ?? "merit");

  // 신원 확인만 최상위에서 기다린다 — notFound()는 스트리밍이 시작되기 전에
  // 던져야 404를 줄 수 있다. 경계 안에서 던지면 이미 200으로 나간 뒤다.
  // 학년도가 아예 없으면 이 조회가 던진다(현재 학급을 붙이느라 현재 학년도를 본다).
  let header: Identity = null;
  let noCurrentYear = false;
  try {
    header = await getStudentIdentity(actor, studentId);
  } catch (error) {
    // 세 권한이 하나도 없으면 볼 탭이 없다 — requirePermission과 같은 자리로 보낸다.
    // 거부 감사로그는 서비스가 이미 남겼다.
    if (error instanceof ForbiddenError) redirect("/forbidden");
    if (!(error instanceof AcademicYearError)) throw error;
    noCurrentYear = true;
  }

  // 없는 학생이면 부여 폼이 멀쩡히 뜨는 화면을 보여주지 않는다.
  if (!noCurrentYear && !header) notFound();

  const removed = header?.removedAt != null;

  // 학번(1307). 학년·반·번호가 다 있고 두 자리를 안 넘을 때만 나온다.
  const seat = header ? formatStudentNumber(header) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* 들어오는 길이 여럿이라(상벌점·출입증 내역·계정 상세) 어느 한 곳으로만
          되돌릴 수 없다. 가장 많이 들어오는 자리 하나를 고정으로 둔다. */}
      <BackLink href="/merit">상벌점</BackLink>

      <SectionCard
        variant="panel"
        title={
          header ? (
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-title">
              {/* 역할을 모르면 「님」으로 떨어진다 — 학생 상세라 실제로는 늘 학생이다. */}
              {honorificName(header.name, isRole(header.role) ? header.role : "STUDENT")}
              {/* 사용자 상세와 같은 배지·같은 문구를 쓴다 — 같은 사실이다. */}
              {removed && <Badge tone="rejected">삭제됨</Badge>}
            </span>
          ) : (
            // 현재 학년도가 없으면 신원 조회 자체가 못 돌아 이름을 모른다.
            "학생"
          )
        }
        controls={
          <>
            {header && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-caption text-mut">
                  {/* 학번이 먼저다 — 교사가 학생을 부르고 적을 때 쓰는 값이다.
                      학생코드는 그 뒤에 온다: 동명이인을 가르고 해가 바뀌어도
                      안 변하지만, 평소에 입으로 부르는 값이 아니다. */}
                  {seat && <span className="tabular-nums text-ink">{seat}</span>}
                  {seat && " · "}
                  {header.grade !== null && header.classNo !== null
                    ? `${header.grade}학년 ${header.classNo}반${header.number !== null ? ` ${header.number}번` : ""}`
                    : "소속 미배정"}
                  {" · "}
                  <span className="font-mono">{header.studentCode}</span>
                </p>
                {/* 부여 폼은 학적을 보지 않는다 — 막지 않되 머리글에서 보이게 한다. */}
                <EnrollmentTag status={header.status} />
              </div>
            )}

            <nav aria-label="학생 갈래" className="mt-3 flex flex-wrap gap-1.5">
              {visible.map((item) => (
                <ChipLink
                  key={item}
                  size="sm"
                  active={item === tab}
                  href={studentHref(studentId, raw, { tab: studentTabParam(item) })}
                >
                  {STUDENT_TAB_LABELS[item]}
                </ChipLink>
              ))}
            </nav>
          </>
        }
      />

      {tab === "merit" && (
        <MeritTab
          actor={actor}
          studentId={studentId}
          params={raw}
          removedAt={header?.removedAt ?? null}
          noCurrentYear={noCurrentYear}
        />
      )}
      {tab === "pass" && <PassTab actor={actor} studentId={studentId} params={raw} />}
      {tab === "profile" && <ProfileTab actor={actor} studentId={studentId} />}
    </div>
  );
}
