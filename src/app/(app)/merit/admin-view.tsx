import Link from "next/link";
import type { SessionUser } from "@/core/auth/session";
import { isYearScoped, type MeritTrack } from "@/core/authz/merit-track";
import { ChipLink } from "@/components/ui/chip-link";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SearchForm } from "@/components/ui/search-form";
import { SectionCard } from "@/components/ui/section-card";
import { StudentSearchResults } from "@/components/merit/student-search-results";
import { TrackTabs } from "@/components/merit/track-tabs";
import { formatDateInput } from "@/lib/datetime";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import { classRosterSchema } from "@/modules/merit/merit.schema";
import { getClassRoster, searchStudents } from "@/modules/merit/award.service";
import { listActiveRules } from "@/modules/merit/rule.service";
import { getDemeritThresholds } from "@/modules/merit/threshold.service";
import { ClassRoster } from "./class-roster";

type Params = SearchParamsInput;

/** 탭·필터 링크. 다른 쿼리를 지우지 않는다 — 반·학년도를 고른 채 탭만 옮길 수 있어야 한다. */
function meritHref(params: Params, patch: Record<string, string>): string {
  return hrefWith("/merit", params, patch);
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

  // 두 조회 다 getCurrentYear()를 거친다. 학년도가 없으면 던지므로 여기서 잡아
  // 페이지 전체가 아니라 안내만 보여준다.
  let noCurrentYear = false;

  let results: Awaited<ReturnType<typeof searchStudents>> = [];
  if (q) {
    try {
      results = await searchStudents(actor, q);
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
      <TrackTabs current={track} hrefFor={(t) => meritHref(params, { track: t })} />

      {noCurrentYear && <NoAcademicYearNotice />}

      {/* 트랙만 함께 싣는다 — 검색은 전교 대상이라 골라 둔 학년·반을 들고 가면 안 맞는다. */}
      <SearchForm
        defaultValue={q}
        placeholder="이름 또는 학생코드로 검색"
        ariaLabel="학생 이름 또는 학생코드 검색"
        hidden={{ track }}
      />

      {q && (
        <StudentSearchResults
          rows={results}
          hrefFor={(row) => `/merit/students/${row.studentProfileId}?track=${track}`}
        />
      )}

      {/* 이 검색은 명단에 있는 학생만 찾는다. 그 밖을 찾는 화면으로 가는 길을 둔다. */}
      {q && (
        <p className="text-xs text-mut">
          <Link
            href={`/merit/students?q=${encodeURIComponent(q)}`}
            className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            명단에서 빠진 학생까지 찾기
          </Link>
        </p>
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
          // 오늘 날짜는 서버에서 만든다 — 클라이언트에서 만들면 하이드레이션이 깨진다.
          today={formatDateInput(new Date())}
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
