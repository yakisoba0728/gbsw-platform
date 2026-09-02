import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { ForbiddenError } from "@/core/authz/errors";
import { honorificName, isRole } from "@/core/authz/roles";
import { EnrollmentTag } from "@/components/merit/enrollment-tag";
import { BackLink } from "@/components/ui/back-link";
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

export const metadata: Metadata = { title: "학생" };

type Identity = Awaited<ReturnType<typeof getStudentIdentity>>;

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

  const visible = STUDENT_TABS.filter((tab) => can(actor, STUDENT_TAB_ACTIONS[tab]));
  const requested = parseStudentTab(raw.tab);
  const tab: StudentTab = visible.includes(requested) ? requested : (visible[0] ?? "merit");

  let header: Identity = null;
  let noCurrentYear = false;
  try {
    header = await getStudentIdentity(actor, studentId);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/forbidden");
    if (!(error instanceof AcademicYearError)) throw error;
    noCurrentYear = true;
  }

  if (!noCurrentYear && !header) notFound();

  const seat = header ? formatStudentNumber(header) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <BackLink href="/merit">상벌점</BackLink>

      <SectionCard
        variant="panel"
        title={
          header ? (
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-title">
              {honorificName(header.name, isRole(header.role) ? header.role : "STUDENT")}
            </span>
          ) : (
            "학생"
          )
        }
        controls={
          <>
            {header && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-caption text-mut">
                  {seat && <span className="tabular-nums text-ink">{seat}</span>}
                  {seat && " · "}
                  {header.grade !== null && header.classNo !== null
                    ? `${header.grade}학년 ${header.classNo}반${header.number !== null ? ` ${header.number}번` : ""}`
                    : "소속 미배정"}
                  {" · "}
                  <span className="font-mono">{header.studentCode}</span>
                </p>
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
          removed={header?.removed ?? false}
          noCurrentYear={noCurrentYear}
        />
      )}
      {tab === "pass" && <PassTab actor={actor} studentId={studentId} params={raw} />}
      {tab === "profile" && <ProfileTab actor={actor} studentId={studentId} />}
    </div>
  );
}
