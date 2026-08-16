import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { formatDateInput } from "@/lib/datetime";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import {
  getStudentHeader,
  getStudentMerit,
  listAwardYears,
} from "@/modules/merit/award.service";
import { listActiveRules } from "@/modules/merit/rule.service";
import { ExportHistoryButton } from "../../export-button";
import { YearPicker } from "../../year-picker";
import { AwardForm } from "./award-form";

export const metadata: Metadata = { title: "학생 상벌점" };

type Params = Record<string, string | string[] | undefined>;

/** 트랙 탭. **학년도를 보존한다** — 안 그러면 탭을 옮길 때마다 현재 학년도로 튕긴다. */
function trackHref(studentId: string, params: Params, track: MeritTrack): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  query.set("track", track);
  // 기숙사는 누적이라 학년도가 의미 없다. 남겨 두면 교내로 돌아올 때 되살아나
  // "어느 해를 보고 있었지"를 헷갈리게 만든다.
  if (track === "DORM") query.delete("year");
  return `/merit/students/${studentId}?${query.toString()}`;
}

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
  let header: Awaited<ReturnType<typeof getStudentHeader>> = null;
  let noCurrentYear = false;
  try {
    [view, header] = await Promise.all([
      getStudentMerit(actor, studentId, track, year),
      getStudentHeader(actor, studentId),
    ]);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    noCurrentYear = true;
  }

  // 없는 학생이면 부여 폼이 멀쩡히 뜨는 화면을 보여주지 않는다 — 눌러야만
  // "학생을 찾을 수 없습니다"가 나오면 그 전까지는 정상 화면과 구분되지 않는다.
  if (!noCurrentYear && !header) notFound();

  const awardYears = await listAwardYears(actor, studentId);

  // 과거 학년도를 보고 있으면 부여 폼을 감춘다 — 부여는 항상 현재 학년도로
  // 들어가므로, 지난 해를 보면서 부여하면 결과가 화면에 안 나타나 혼란만 준다.
  // 기숙사(누적)는 "과거"라는 개념이 없어 해당 없다.
  //
  // view.year와 비교하면 안 된다 — scopeYear(year ?? getCurrentYear())의 결과라
  // year를 명시하면 항상 같아진다. 실제 "현재 학년도"와 비교해야 한다.
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

      {header && (
        <div>
          <h2 className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">
            {header.name}
          </h2>
          <p className="mt-1 text-[13px] text-mut">
            {[
              header.studentCode,
              header.grade !== null && header.classNo !== null
                ? `${header.grade}학년 ${header.classNo}반${header.number !== null ? ` ${header.number}번` : ""}`
                : "소속 미배정",
            ].join(" · ")}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        {MERIT_TRACKS.map((t) => (
          <Link
            key={t}
            href={trackHref(studentId, raw, t)}
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

      {/* 교내 탭에서만. 기숙사는 누적이라 고를 학년도가 없다. */}
      {isYearScoped(track) && (
        <YearPicker
          years={awardYears}
          selected={view?.year ?? null}
          params={raw}
          basePath={`/merit/students/${studentId}`}
        />
      )}

      {noCurrentYear || !view ? (
        <NoAcademicYearNotice />
      ) : (
        <>
          <MeritTotalsCards totals={view.totals} />

          {viewingPast ? (
            <p className="rounded-card border border-amber bg-amber-soft px-4 py-3 text-[13px] text-amber-ink">
              지난 학년도를 보고 있습니다. 부여는 현재 학년도에만 할 수 있습니다.
            </p>
          ) : (
            <AwardForm
              studentProfileId={studentId}
              rules={rules}
              // 오늘 날짜는 서버에서 만든다 — 클라이언트에서 만들면 SSR이 그린
              // 값과 어긋나 하이드레이션이 깨진다.
              today={formatDateInput(new Date())}
            />
          )}

          <AwardHistory awards={view.awards} canCancel studentProfileId={studentId} />

          <div className="flex flex-wrap gap-2">
            <ExportHistoryButton
              studentProfileId={studentId}
              track={track}
              year={year}
            />
            <Link
              href={`/merit/students/${studentId}/print?track=${track}${year ? `&year=${year}` : ""}`}
              className="inline-flex items-center rounded-btn border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-mut hover:border-pri hover:text-pri"
            >
              확인서 보기
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
