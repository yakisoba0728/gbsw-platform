import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/session";
import { isMeritTrack, isYearScoped, type MeritTrack } from "@/core/authz/merit-track";
import { ChevronLeftIcon } from "@/components/icons";
import { AwardHistory } from "@/components/merit/award-history";
import { EnrollmentTag } from "@/components/merit/enrollment-tag";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
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

/** 트랙 탭. **학년도를 보존한다** — 안 그러면 탭을 옮길 때마다 현재 학년도로 튕긴다. */
function trackHref(studentId: string, params: Params, track: MeritTrack): string {
  return hrefWith(`/merit/students/${studentId}`, params, {
    track,
    // 기숙사는 누적이라 학년도가 의미 없다. 남겨 두면 교내로 돌아올 때 되살아나
    // "어느 해를 보고 있었지"를 헷갈리게 만든다.
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

  // 명단에서 빠진 학생. **조회만 열려 있다** — 부여 경로는 서비스가 그대로 막으므로
  // (award.service의 findAwardableStudent) 폼을 띄워 봐야 누르는 순간 실패한다.
  const removed = header?.removedAt != null;

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
      {/*
        화살표는 아이콘으로 둔다 — 글자 "←"를 그대로 쓰면 화면을 못 보는
        사람에게 "왼쪽 화살표 상벌점"으로 읽힌다. 아이콘은 안에서 aria-hidden이다.
      */}
      <Link
        href="/merit"
        className="inline-flex items-center gap-1 text-[13px] font-semibold text-mut transition-colors hover:text-pri"
      >
        <ChevronLeftIcon size={15} />
        상벌점
      </Link>

      {header && (
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">
              {header.name}
            </h2>
            {/* 사용자 상세와 같은 배지·같은 문구를 쓴다 — 같은 사실이다. */}
            {removed && <Badge tone="rejected">삭제됨</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-mut">
              {[
                header.studentCode,
                header.grade !== null && header.classNo !== null
                  ? `${header.grade}학년 ${header.classNo}반${header.number !== null ? ` ${header.number}번` : ""}`
                  : "소속 미배정",
              ].join(" · ")}
            </p>
            {/*
              아래 부여 폼은 학적을 보지 않는다 — 졸업생에게도 그대로 들어간다.
              막지는 않되(지난 학년도 기록을 손봐야 할 일이 있다) 무엇을 하고
              있는지는 머리글에서 보이게 한다.
            */}
            <EnrollmentTag status={header.status} />
          </div>
        </div>
      )}

      {/*
        명단에서 빠진 학생이라는 사실은 이름 옆 배지만으로는 부족하다 — 이 화면에서
        평소 있던 부여 폼이 사라지는데, 왜 사라졌는지 적어 두지 않으면 고장으로 읽힌다.
        문구는 admin/users/[userId]의 "명단에서 빠진 계정"과 같은 어조·같은 사실이다
        (소프트 삭제가 그 학년도 소속을 실제로 지운다는 것까지).
      */}
      {removed && header?.removedAt && (
        <Note tone="warn">
          {formatDate(header.removedAt)}에 명단에서 빠진 학생입니다. 지난 상벌점
          기록과 확인서는 그대로 볼 수 있지만, 새 상벌점은 부여할 수 없습니다.
          이번 학년도 소속은 남아 있지 않습니다.
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
            <Note tone="warn">
              지난 학년도를 보고 있습니다. 부여는 현재 학년도에만 할 수 있습니다.
            </Note>
          ) : (
            <AwardForm
              studentProfileId={studentId}
              rules={rules}
              // 오늘 날짜는 서버에서 만든다 — 클라이언트에서 만들면 SSR이 그린
              // 값과 어긋나 하이드레이션이 깨진다.
              today={formatDateInput(new Date())}
            />
          )}

          {/* 취소 서버 액션은 화면이 넘긴다 — 공용 컴포넌트가 app/의 경로를
              알지 않도록(components/merit/cancel-button.tsx 주석 참고). */}
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
