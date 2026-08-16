import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritTrack,
  isYearScoped,
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { AwardHistory } from "@/components/merit/award-history";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import { getStudentMerit } from "@/modules/merit/award.service";
import { listActiveRules } from "@/modules/merit/rule.service";
import { AwardForm } from "./award-form";

export const metadata: Metadata = { title: "학생 상벌점" };

export default async function StudentMeritPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const { studentId } = await params;
  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  const year =
    typeof raw.year === "string" && /^\d{4}$/.test(raw.year)
      ? Number(raw.year)
      : undefined;

  const rules = await listActiveRules(actor, track);

  // year를 명시하지 않고 SCHOOL을 보면 서비스가 내부적으로 getCurrentYear()를
  // 거친다 — 학년도가 아예 없으면 여기서 던진다. 페이지 전체를 에러로 죽이지
  // 않고 안내만 보여준다 (공통 규칙).
  let view: Awaited<ReturnType<typeof getStudentMerit>> | null = null;
  let noCurrentYear = false;
  try {
    view = await getStudentMerit(actor, studentId, track, year);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    noCurrentYear = true;
  }

  // 과거 학년도를 보고 있으면 부여 폼을 감춘다 — 부여는 항상 현재 학년도로
  // 들어가므로, 지난 해를 보면서 부여하면 결과가 화면에 안 나타나 혼란만 준다.
  // 기숙사(누적)는 "과거"라는 개념이 없어 해당 없다.
  //
  // 브리프의 원안(`view.year !== null && year !== view.year`)은 죽은 코드였다 —
  // view.year는 scopeYear(year ?? getCurrentYear())의 결과라 year를 명시하면
  // 항상 view.year와 같아진다. 실제 "현재 학년도"와 비교해야 한다.
  let viewingPast = false;
  if (isYearScoped(track) && year !== undefined) {
    try {
      viewingPast = year !== (await getCurrentYear());
    } catch (error) {
      if (!(error instanceof AcademicYearError)) throw error;
      // 현재 학년도가 아예 없으면 부여 자체가 불가능하다 — 과거로 취급한다.
      viewingPast = true;
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/merit" className="text-[13px] font-semibold text-mut hover:text-pri">
        ← 상벌점
      </Link>

      <div className="flex items-center gap-2">
        {MERIT_TRACKS.map((t) => (
          <Link
            key={t}
            href={`/merit/students/${studentId}?track=${t}`}
            className={
              t === track
                ? "rounded-full bg-pri px-4 py-2 text-[13px] font-bold text-white"
                : "rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-mut hover:border-pri hover:text-pri"
            }
          >
            {MERIT_TRACK_LABELS[t]}
          </Link>
        ))}
      </div>

      {noCurrentYear || !view ? (
        <NoAcademicYearNotice />
      ) : (
        <>
          <MeritTotalsCards totals={view.totals} />

          {!viewingPast && <AwardForm studentProfileId={studentId} rules={rules} />}

          <AwardHistory awards={view.awards} canCancel studentProfileId={studentId} />
        </>
      )}
    </div>
  );
}
