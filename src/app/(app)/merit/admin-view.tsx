import type { SessionUser } from "@/core/auth/session";
import {
  isYearScoped,
  MERIT_TRACK_TITLES,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { ChipLink } from "@/components/ui/chip-link";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SearchForm } from "@/components/ui/search-form";
import { SectionCard } from "@/components/ui/section-card";
import { StudentSearchResults } from "@/components/merit/student-search-results";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import { classRosterSchema } from "@/modules/merit/merit.schema";
import { getClassRoster, searchStudents } from "@/modules/merit/award.service";
import { listActiveRules } from "@/modules/merit/rule.service";
import { getDemeritThresholds } from "@/modules/merit/threshold.service";
import { TrackTabs } from "@/components/merit/track-tabs";
import { ClassRoster } from "./class-roster";

type Params = SearchParamsInput;

/** 탭·필터 링크. 다른 쿼리를 지우지 않는다 — 반·학년도를 고른 채 탭만 옮길 수 있어야 한다. */
function meritHref(params: Params, patch: Record<string, string>): string {
  return hrefWith("/merit", params, patch);
}

/** 트랙 탭. 고른 반은 들고 가고 학년도만 버린다 — 기숙사는 누적이라 의미가 없다. */
function trackHrefFor(params: Params, track: MeritTrack): string {
  return hrefWith("/merit", params, {
    track,
    ...(track === "DORM" ? { year: null } : {}),
  });
}

export async function AdminMeritView({
  actor,
  track,
  params,
}: {
  actor: SessionUser;
  track: MeritTrack;
  params: Params;
}) {
  const q = typeof params.q === "string" ? params.q : "";
  const trackHref = (next: MeritTrack) => trackHrefFor(params, next);

  // 두 조회 다 getCurrentYear()를 거친다. 학년도가 없으면 던지므로 여기서 잡아
  // 페이지 전체가 아니라 안내만 보여준다.
  let noCurrentYear = false;

  let results: Awaited<ReturnType<typeof searchStudents>> = [];
  if (q) {
    try {
      // 명단에서 빠진 학생도 함께 낸다. 화면을 따로 두었더니 "명단에서 빠진 학생까지
      // 찾기"라는 링크가 무슨 뜻인지 아무도 몰랐고, 그 화면이 빠진 학생을 찾을 수 있는
      // 유일한 길이었다(계정 관리 목록도 deletedAt으로 거른다). 결과에 「삭제됨」이
      // 붙고 부여는 서비스가 막으므로, 한 칸에서 찾아도 잘못 줄 수 없다.
      results = await searchStudents(actor, q, { includeRemoved: true });
    } catch (error) {
      if (!(error instanceof AcademicYearError)) throw error;
      noCurrentYear = true;
    }
  }

  // 학년·반이 둘 다 유효할 때만 반 명단을 부른다. 하나만 고른 중간 상태는 정상이다.
  const rosterQuery = classRosterSchema.safeParse({
    grade: params.grade,
    classNo: params.classNo,
    track,
    year: params.year,
  });
  let roster: Awaited<ReturnType<typeof getClassRoster>> | null = null;
  let rules: Awaited<ReturnType<typeof listActiveRules>> = [];
  // 조회가 React cache를 거치므로 여기서 미리 읽어도 왕복이 늘지 않는다.
  const thresholds = await getDemeritThresholds(track);
  if (rosterQuery.success) {
    try {
      [roster, rules] = await Promise.all([
        getClassRoster(actor, rosterQuery.data),
        listActiveRules(actor, track),
      ]);
    } catch (error) {
      if (!(error instanceof AcademicYearError)) throw error;
      noCurrentYear = true;
    }
  }

  // 지난 학년도를 보고 있으면 일괄 부여 폼을 감춘다 — 부여 결과가 이 화면에 안 나타난다.
  let viewingPast = false;
  if (
    isYearScoped(track) &&
    rosterQuery.success &&
    rosterQuery.data.year !== undefined &&
    !noCurrentYear
  ) {
    try {
      viewingPast = rosterQuery.data.year !== (await getCurrentYear());
    } catch (error) {
      if (!(error instanceof AcademicYearError)) throw error;
      viewingPast = true;
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* 제목은 정식 이름(그린마일리지), 탭은 짧은 표기(교내)라 나란히 둬도 겹치지
          않는다. 상단바 제목은 쿼리를 떼고 찾으므로 어느 트랙이든 "상벌점"이다 —
          지금 어느 쪽을 보고 있는지는 이 줄이 답한다. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title font-semibold text-ink">
          {MERIT_TRACK_TITLES[track]}
        </h2>
        <TrackTabs current={track} hrefFor={trackHref} size="sm" />
      </div>

      {noCurrentYear && <NoAcademicYearNotice />}

      {/* 트랙만 함께 싣는다 — 검색은 전교 대상이라 골라 둔 학년·반을 들고 가면 안 맞는다. */}
      <SearchForm
        defaultValue={q}
        placeholder="학번 · 이름 · 학생코드로 검색"
        ariaLabel="학번 · 이름 · 학생코드로 학생 검색"
        hidden={{ track }}
      />

      {q && (
        <StudentSearchResults
          rows={results}
          hrefFor={(row) => `/merit/students/${row.studentProfileId}?track=${track}`}
        />
      )}

      <ClassPicker params={params} track={track} />

      {roster && rosterQuery.success && (
        // key가 없으면 반을 바꿔도 컴포넌트가 다시 마운트되지 않아, 체크해 둔
        // 학생 id가 남은 채로 화면에 없는 학생에게 벌점이 들어간다.
        <ClassRoster
          key={`${track}-${rosterQuery.data.year ?? "current"}-${rosterQuery.data.grade}-${rosterQuery.data.classNo}`}
          rows={roster}
          grade={rosterQuery.data.grade}
          classNo={rosterQuery.data.classNo}
          track={track}
          thresholds={thresholds}
          year={rosterQuery.data.year}
          viewingPast={viewingPast}
          rules={rules}
        />
      )}
    </div>
  );
}

const GRADES = [1, 2, 3];
const CLASS_NOS = [1, 2, 3, 4];

/** 학년·반 고르기. 폼이 아니라 링크라서 선택 상태가 URL에 남는다. */
function ClassPicker({ params, track }: { params: Params; track: MeritTrack }) {
  const grade = typeof params.grade === "string" ? params.grade : "";
  const classNo = typeof params.classNo === "string" ? params.classNo : "";

  return (
    <SectionCard variant="panel" title="반 고르기">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-mut">학년</span>
        {GRADES.map((g) => (
          <ChipLink
            key={g}
            size="sm"
            href={meritHref(params, { track, grade: String(g) })}
            active={grade === String(g)}
          >
            {g}학년
          </ChipLink>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-mut">반</span>
        {CLASS_NOS.map((c) => (
          <ChipLink
            key={c}
            size="sm"
            href={meritHref(params, { track, classNo: String(c) })}
            active={classNo === String(c)}
          >
            {c}반
          </ChipLink>
        ))}
      </div>
    </SectionCard>
  );
}
