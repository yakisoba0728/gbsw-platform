import Link from "next/link";
import { Suspense } from "react";
import type { SessionUser } from "@/core/auth/session";
import { isMeritTrack, isYearScoped, type MeritTrack } from "@/core/authz/merit-track";
import { ForbiddenError } from "@/core/authz/errors";
import { AwardHistory } from "@/components/merit/award-history";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { TrackTabs } from "@/components/merit/track-tabs";
import { buttonClass } from "@/components/ui/button";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { Note } from "@/components/ui/note";
import {
  Skeleton,
  SkeletonScreen,
  SkeletonStats,
  SkeletonTable,
} from "@/components/ui/skeleton";
import { formatDate } from "@/lib/datetime";
import type { SearchParamsInput } from "@/lib/search-params";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import { getStudentMerit, listAwardYears } from "@/modules/merit/award.service";
import { listActiveRules } from "@/modules/merit/rule.service";
import { EMPTY_MERIT_STATE } from "@/app/(app)/merit/action-state";
import { cancelAction } from "@/app/(app)/merit/actions";
import { ExportHistoryButton } from "@/app/(app)/merit/export-button";
import { YearPicker } from "@/app/(app)/merit/year-picker";
import { AwardForm } from "./award-form";
import { studentHref } from "./student-tab";

type Params = SearchParamsInput;

/** 본문이 기다릴 두 약속. 함께 만들거나 함께 만들지 않는다. */
type MeritLoad = {
  view: ReturnType<typeof getStudentMerit>;
  rules: ReturnType<typeof listActiveRules>;
};

/** 트랙 탭. 학년도를 보존한다 — 안 그러면 탭을 옮길 때마다 현재 학년도로 튕긴다. */
function trackHref(studentId: string, params: Params, track: MeritTrack): string {
  return studentHref(studentId, params, {
    track,
    // 기숙사는 누적이라 학년도가 의미 없다.
    ...(track === "DORM" ? { year: null } : {}),
  });
}

/**
 * 학년도가 아예 없으면 조회가 던진다. 화면을 죽이지 않고 안내만 보여주므로
 * 거부를 여기서 잡는다 — 경계 밖으로 던지면 error.tsx로 새어 화면 전체가 오류가 된다.
 * 같은 약속을 두 경계가 나눠 기다리므로 양쪽 다 이 함수를 거친다.
 */
async function readView(promise: MeritLoad["view"]) {
  try {
    return await promise;
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return null;
  }
}

/**
 * 상벌점 갈래. `/merit/students/<id>`의 몸통을 그대로 옮긴 것이다 —
 * 머리글과 뒤로가기만 화면(page.tsx)이 가져갔다.
 *
 * **아무것도 await 하지 않는다** — 한 번이라도 멈추면 이 함수 전체가 서지 못해
 * 트랙 탭까지 뼈대로 덮인다. 기다림은 아래 Suspense 경계 안에서만 일어난다.
 */
export function MeritTab({
  actor,
  studentId,
  params,
  removedAt,
  noCurrentYear,
}: {
  actor: SessionUser;
  studentId: string;
  params: Params;
  /** 명단에서 빠진 날. null이면 명단에 남아 있는 학생이다. */
  removedAt: Date | null;
  noCurrentYear: boolean;
}) {
  const track: MeritTrack = isMeritTrack(params.track) ? params.track : "SCHOOL";
  const year =
    typeof params.year === "string" && /^\d{4}$/.test(params.year)
      ? Number(params.year)
      : undefined;

  // 조회를 시작만 하고 기다리지 않는다. 아무도 기다리지 않는 약속은 거부돼도 잡을
  // 사람이 없으므로, 학년도가 없어 본문 대신 안내를 그리는 경우에는 시작조차 하지 않는다.
  const load: MeritLoad | null = noCurrentYear
    ? null
    : {
        view: getStudentMerit(actor, studentId, track, year),
        // 부여 선택지는 merit:award로 막힌다 — 조회만 열린 사람에게는 거부가 온다.
        // 그 실패로 탭이 통째로 터지면 안 된다: 목록은 보이고 부여 폼만 빠진다.
        rules: listActiveRules(actor, track).catch((error) => {
          if (error instanceof ForbiddenError) return [];
          throw error;
        }),
      };

  // 학년도 칩은 교내 탭에서만 선다 — 기숙사는 누적이라 고를 학년도가 없다.
  // 현재 학년도가 없어도 그대로 선다: 지난 해 기록은 여전히 고를 수 있다.
  const awardYearsPromise = isYearScoped(track)
    ? listAwardYears(actor, studentId)
    : null;

  // 조건이 바뀌면 경계를 새로 만든다. 이미 해결된 Suspense 경계는 자식이 다시 매달려도
  // 뼈대 대신 **옛 내용을 그대로** 보여준다 — key가 없으면 탭을 옮겨도 안 바뀐 것처럼 보인다.
  // 두 경계가 나란히 서므로 앞에 이름을 붙인다 — 같은 key를 단 형제는 React가 경고한다.
  const boundaryKey = JSON.stringify({ track, year: year ?? null });

  // 명단에서 빠진 학생은 조회만 열려 있다 — 부여는 서비스가 그대로 막는다.
  const removed = removedAt !== null;

  return (
    <div className="space-y-4">
      <TrackTabs
        current={track}
        hrefFor={(t) => trackHref(studentId, params, t)}
      />

      {/* 부여 폼이 사라지는 이유를 적어 둔다 — 안 적으면 고장으로 읽힌다. */}
      {removed && removedAt && (
        <Note tone="warn">
          {formatDate(removedAt)}에 명단에서 빠진 학생입니다. 새 상벌점은 부여할 수
          없습니다.
        </Note>
      )}

      {awardYearsPromise && (
        // 학년도는 지금 고른 조건이라 결과와 함께 뼈대로 덮이면 안 된다. 다만 기록이
        // 없는 학생은 칩이 아예 없어서, 뼈대를 그리면 도착하는 순간 자리가 사라진다 —
        // 뼈대 없이 자리만 비운다.
        <Suspense key={`years:${boundaryKey}`} fallback={null}>
          <StudentYearPicker
            yearsPromise={awardYearsPromise}
            viewPromise={load?.view ?? null}
            params={params}
            studentId={studentId}
          />
        </Suspense>
      )}

      <Suspense key={`body:${boundaryKey}`} fallback={<StudentMeritSkeleton />}>
        <StudentMeritBody
          load={load}
          studentId={studentId}
          track={track}
          year={year}
          removed={removed}
        />
      </Suspense>
    </div>
  );
}

/** 결과 자리의 뼈대. loading.tsx의 같은 자리와 모양을 맞춘다 — 어긋나면 도착할 때 튄다. */
function StudentMeritSkeleton() {
  return (
    <SkeletonScreen className="space-y-4">
      {/* 합계 카드는 상쇄점이 0이면 3칸이다 — 흔한 쪽에 맞춘다. */}
      <SkeletonStats count={3} />
      {/* 부여 폼 */}
      <Skeleton className="h-[180px]" />
      <SkeletonTable />
    </SkeletonScreen>
  );
}

/**
 * 학년도 칩. 고른 학년도는 조회 결과(scopeYear)가 정하므로 본문과 같은 약속을
 * 나눠 기다린다 — 질의가 늘지 않는다.
 */
async function StudentYearPicker({
  yearsPromise,
  viewPromise,
  params,
  studentId,
}: {
  yearsPromise: ReturnType<typeof listAwardYears>;
  viewPromise: MeritLoad["view"] | null;
  params: Params;
  studentId: string;
}) {
  const [years, view] = await Promise.all([
    yearsPromise,
    viewPromise ? readView(viewPromise) : null,
  ]);

  return (
    <YearPicker
      years={years}
      selected={view?.year ?? null}
      params={params}
      basePath={`/students/${studentId}`}
    />
  );
}

/** 합계·부여 폼·내역. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
async function StudentMeritBody({
  load,
  studentId,
  track,
  year,
  removed,
}: {
  load: MeritLoad | null;
  studentId: string;
  track: MeritTrack;
  year: number | undefined;
  removed: boolean;
}) {
  if (!load) return <NoAcademicYearNotice />;

  // 갈라지기 전에 둘 다 기다린다 — 규정을 안 기다리고 빠져나가면 그 약속이 거부됐을 때
  // 잡을 사람이 없다.
  const [view, rules] = await Promise.all([readView(load.view), load.rules]);
  if (!view) return <NoAcademicYearNotice />;

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
    <>
      <MeritTotalsCards totals={view.totals} />

      {/* 명단에서 빠졌으면 폼 자리를 비운다 — 이유는 위 배너가 이미 적었다. */}
      {/* rules가 비면 부여 권한이 없는 것이다 — 고를 것 없는 폼을 세우지 않는다. */}
      {removed || rules.length === 0 ? null : viewingPast ? (
        <Note tone="warn">부여는 현재 학년도에만 할 수 있습니다.</Note>
      ) : (
        <AwardForm studentProfileId={studentId} rules={rules} />
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
          href={`/students/${studentId}/print?track=${track}${year ? `&year=${year}` : ""}`}
          className={buttonClass({ variant: "secondary" })}
        >
          확인서
        </Link>
      </div>
    </>
  );
}
