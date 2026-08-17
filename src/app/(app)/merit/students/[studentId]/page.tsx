import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/session";
import { isMeritTrack, isYearScoped, type MeritTrack } from "@/core/authz/merit-track";
import { AwardHistory } from "@/components/merit/award-history";
import { EnrollmentTag } from "@/components/merit/enrollment-tag";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { TrackTabs } from "@/components/merit/track-tabs";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { Note } from "@/components/ui/note";
import { formatDate, formatDateInput } from "@/lib/datetime";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
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
import { EMPTY_MERIT_STATE } from "../../action-state";
import { cancelAction } from "../../actions";
import { ExportHistoryButton } from "../../export-button";
import { YearPicker } from "../../year-picker";
import { AwardForm } from "./award-form";

export const metadata: Metadata = { title: "학생 상벌점" };

type Params = SearchParamsInput;

/** 트랙 탭. 학년도를 보존한다 — 안 그러면 탭을 옮길 때마다 현재 학년도로 튕긴다. */
function trackHref(studentId: string, params: Params, track: MeritTrack): string {
  return hrefWith(`/merit/students/${studentId}`, params, {
    track,
    // 기숙사는 누적이라 학년도가 의미 없다.
    ...(track === "DORM" ? { year: null } : {}),
  });
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

  // 학년도가 아예 없으면 조회가 던진다. 페이지를 죽이지 않고 안내만 보여준다.
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

  // 없는 학생이면 부여 폼이 멀쩡히 뜨는 화면을 보여주지 않는다.
  if (!noCurrentYear && !header) notFound();

  const awardYears = await listAwardYears(actor, studentId);

  // 명단에서 빠진 학생은 조회만 열려 있다 — 부여는 서비스가 그대로 막는다.
  const removed = header?.removedAt != null;

  // view.year와 비교하면 안 된다 — scopeYear의 결과라 year를 명시하면 항상 같아진다.
  // 실제 현재 학년도와 비교해야 지난 해를 보는 중인지 알 수 있다.
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
      <BackLink href="/merit">상벌점</BackLink>

      {header && (
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="text-title font-semibold text-ink">{header.name}</h2>
            {/* 사용자 상세와 같은 배지·같은 문구를 쓴다 — 같은 사실이다. */}
            {removed && <Badge tone="rejected">삭제됨</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-caption text-mut">
              <span className="font-mono">{header.studentCode}</span>
              {" · "}
              {header.grade !== null && header.classNo !== null
                ? `${header.grade}학년 ${header.classNo}반${header.number !== null ? ` ${header.number}번` : ""}`
                : "소속 미배정"}
            </p>
            {/* 부여 폼은 학적을 보지 않는다 — 막지 않되 머리글에서 보이게 한다. */}
            <EnrollmentTag status={header.status} />
          </div>
        </div>
      )}

      {/* 부여 폼이 사라지는 이유를 적어 둔다 — 안 적으면 고장으로 읽힌다. */}
      {removed && header?.removedAt && (
        <Note tone="warn">
          {formatDate(header.removedAt)}에 명단에서 빠진 학생입니다. 기록은 볼 수
          있지만 새 상벌점은 부여할 수 없습니다.
        </Note>
      )}

      <TrackTabs current={track} hrefFor={(t) => trackHref(studentId, raw, t)} />

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

          {/* 명단에서 빠졌으면 폼 자리를 비운다 — 이유는 위 배너가 이미 적었다. */}
          {removed ? null : viewingPast ? (
            <Note tone="warn">부여는 현재 학년도에만 할 수 있습니다.</Note>
          ) : (
            <AwardForm
              studentProfileId={studentId}
              rules={rules}
              // 오늘 날짜는 서버에서 만든다 — 아니면 하이드레이션이 깨진다.
              today={formatDateInput(new Date())}
            />
          )}

          {/* 취소 액션은 화면이 넘긴다 — 공용 컴포넌트가 app/의 경로를 알지 않도록. */}
          <AwardHistory
            awards={view.awards}
            studentProfileId={studentId}
            cancelAction={cancelAction}
            initialState={EMPTY_MERIT_STATE}
          />

          <div className="flex flex-wrap gap-2">
            <ExportHistoryButton
              studentProfileId={studentId}
              track={track}
              year={year}
            />
            <Link
              href={`/merit/students/${studentId}/print?track=${track}${year ? `&year=${year}` : ""}`}
              className={buttonClass({ variant: "secondary" })}
            >
              확인서
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
