import { Suspense } from "react";
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
import { SkeletonScreen, SkeletonTable } from "@/components/ui/skeleton";
import { StudentSearchResults } from "@/components/merit/student-search-results";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import {
  classRosterSchema,
  type ClassRosterInput,
} from "@/modules/merit/merit.schema";
import { getClassRoster, searchStudents } from "@/modules/merit/award.service";
import { listActiveRules } from "@/modules/merit/rule.service";
import { getDemeritThresholds } from "@/modules/merit/threshold.service";
import { TrackTabs } from "@/components/merit/track-tabs";
import { ClassRoster } from "./class-roster";

type Params = SearchParamsInput;

/** 탭·필터 링크. 다른 쿼리를 지우지 않는다 — 반·학년도를 고른 채 탭만 옮길 수 있어야 한다. */
function meritHref(params: Params, patch: Record<string, string | null>): string {
  return hrefWith("/merit", params, patch);
}

/** 트랙 탭. 고른 반은 들고 가고 학년도만 버린다 — 기숙사는 누적이라 의미가 없다. */
function trackHrefFor(params: Params, track: MeritTrack): string {
  return hrefWith("/merit", params, {
    track,
    ...(track === "DORM" ? { year: null } : {}),
  });
}

/**
 * 교사 화면. **아무것도 await 하지 않는다** — 한 번이라도 멈추면 이 함수 전체가 서지
 * 못해 검색칸·탭·반 고르기까지 통째로 뼈대가 되고, 방금 글자를 넣은 칸이 사라진다.
 * 기다림은 전부 아래의 결과 컴포넌트로 내려간다.
 */
export function AdminMeritView({
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

  // 범위는 좁히는 것이지 여는 조건이 아니다 — 학년·반을 안 고르면 전교가, 학년만
  // 고르면 그 학년 전체가 나온다. 명단이 늘 서 있어야 검색 없이도 학생을 찾을 수 있다.
  const rosterQuery = classRosterSchema.safeParse({
    grade: params.grade,
    classNo: params.classNo,
    track,
    year: params.year,
  });
  // 손으로 넣은 잘못된 범위(?grade=9)는 좁히지 않은 것으로 되돌린다. 화면이 비는 것보다
  // 전교가 보이는 쪽이 낫다 — 다른 목록들도 잘못된 쿼리를 안전한 기본값으로 되돌린다.
  const rosterScope: ClassRosterInput = rosterQuery.success
    ? rosterQuery.data
    : { track };

  // 조회를 시작만 하고 약속을 들고 있는다. 세 경계가 이 약속을 나눠 기다리므로
  // 질의는 한 번이다.
  const searchPromise = q ? loadSearch(actor, q) : null;
  const rosterPromise = loadRoster(actor, rosterScope);

  // 조건이 바뀌면 경계를 새로 만든다. 이미 해결된 Suspense 경계는 자식이 다시 매달려도
  // 뼈대 대신 **옛 내용을 그대로** 보여준다 — key가 없으면 검색해도 결과가 안 바뀐 것처럼
  // 보인다. 검색과 반 명단은 서로 다른 조건(q vs 학년·반)에서 나오므로 key도 나눈다 —
  // 하나로 묶으면 검색만 했는데 반 명단까지 뼈대가 된다.
  const searchKey = JSON.stringify({ q, track });
  const rosterKey = JSON.stringify(rosterScope);

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

      {/* 이 안내는 조건이 아니라 조회 결과에서 나온다. 자리는 여기지만 기다림은
          결과와 같은 약속을 나눠 쓴다 — 없을 때가 대부분이라 뼈대 없이 비워 둔다. */}
      <Suspense key={`${searchKey}|${rosterKey}`} fallback={null}>
        <NoYearNotice search={searchPromise} roster={rosterPromise} />
      </Suspense>

      {/* 트랙만 함께 싣는다 — 검색은 전교 대상이라 골라 둔 학년·반을 들고 가면 안 맞는다. */}
      <SearchForm
        action="/merit"
        defaultValue={q}
        placeholder="학번 · 이름 · 학생코드로 검색"
        ariaLabel="학번 · 이름 · 학생코드로 학생 검색"
        hidden={{ track }}
      />

      {searchPromise && (
        <Suspense
          key={searchKey}
          fallback={
            <SkeletonScreen className="space-y-4">
              <SkeletonTable rows={3} />
            </SkeletonScreen>
          }
        >
          <SearchResults promise={searchPromise} track={track} />
        </Suspense>
      )}

      {/* 학년·반은 상수에서 나온다 — 조회가 아니라 지금 고른 것이라 경계 밖에 선다. */}
      <ClassPicker params={params} track={track} />

      <Suspense
        key={rosterKey}
        fallback={
          <SkeletonScreen className="space-y-4">
            <SkeletonTable rows={8} />
          </SkeletonScreen>
        }
      >
        <ClassRosterSection promise={rosterPromise} query={rosterScope} />
      </Suspense>
    </div>
  );
}

type SearchPromise = ReturnType<typeof loadSearch>;
type RosterPromise = ReturnType<typeof loadRoster>;

/**
 * 학생 검색. 현재 학년도가 없으면 서비스가 던지므로 여기서 받아 null로 바꾼다 —
 * 경계 밖으로 새면 error.tsx가 화면 전체를 오류로 덮는다.
 */
async function loadSearch(actor: SessionUser, q: string) {
  try {
    // 명단에서 빠진 학생도 함께 낸다. 화면을 따로 두었더니 "명단에서 빠진 학생까지
    // 찾기"라는 링크가 무슨 뜻인지 아무도 몰랐고, 그 화면이 빠진 학생을 찾을 수 있는
    // 유일한 길이었다(계정 관리 목록도 deletedAt으로 거른다). 결과에 「삭제됨」이
    // 붙고 부여는 서비스가 막으므로, 한 칸에서 찾아도 잘못 줄 수 없다.
    return await searchStudents(actor, q, { includeRemoved: true });
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return null;
  }
}

type RosterData = {
  rows: Awaited<ReturnType<typeof getClassRoster>>;
  rules: Awaited<ReturnType<typeof listActiveRules>>;
  thresholds: Awaited<ReturnType<typeof getDemeritThresholds>>;
  /** 지난 학년도를 보고 있는가. true면 부여 폼을 감춘다. */
  viewingPast: boolean;
};

/**
 * 반 명단 한 덩어리 — 명단·규정·기준·지난 학년도 여부. 화면이 한 번에 그리는 것이라
 * 기다림도 하나로 묶는다. 현재 학년도가 없으면 null이고, 안내는 NoYearNotice가 낸다.
 */
async function loadRoster(
  actor: SessionUser,
  query: ClassRosterInput,
): Promise<RosterData | null> {
  let rows: RosterData["rows"];
  let rules: RosterData["rules"];
  let thresholds: RosterData["thresholds"];
  try {
    [rows, rules, thresholds] = await Promise.all([
      getClassRoster(actor, query),
      listActiveRules(actor, query.track),
      getDemeritThresholds(query.track),
    ]);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return null;
  }

  // 지난 학년도를 보고 있으면 일괄 부여 폼을 감춘다 — 부여 결과가 이 화면에 안 나타난다.
  // 명단을 얻고도 현재 학년도를 못 읽는 경우가 있다(?year=로 지난 해를 콕 집어 보는
  // 중이면 명단은 나온다). 그때도 부여는 할 수 없으므로 폼을 감춘다.
  let viewingPast = false;
  if (isYearScoped(query.track) && query.year !== undefined) {
    try {
      viewingPast = query.year !== (await getCurrentYear());
    } catch (error) {
      if (!(error instanceof AcademicYearError)) throw error;
      viewingPast = true;
    }
  }

  return { rows, rules, thresholds, viewingPast };
}

/**
 * 학년도 안내. 검색과 반 명단이 같은 이유(현재 학년도 없음)로 비므로 안내는 한 줄이면
 * 된다. 두 약속을 나눠 기다릴 뿐 서비스를 다시 부르지 않는다.
 */
async function NoYearNotice({
  search,
  roster,
}: {
  search: SearchPromise | null;
  roster: RosterPromise | null;
}) {
  // Promise.all로 묶지 않는다 — 부르지 않은 쪽의 null과 "학년도 없음"의 null이
  // 한 배열에서 구분되지 않는다.
  const noYear =
    (search !== null && (await search) === null) ||
    (roster !== null && (await roster) === null);

  return noYear ? <NoAcademicYearNotice /> : null;
}

/** 검색 결과. 학년도가 없으면 결과가 없는 것과 같은 화면이고, 이유는 위의 안내가 말한다. */
async function SearchResults({
  promise,
  track,
}: {
  promise: SearchPromise;
  track: MeritTrack;
}) {
  const rows = await promise;

  return (
    <StudentSearchResults
      rows={rows ?? []}
      hrefFor={(row) => `/merit/students/${row.studentProfileId}?track=${track}`}
    />
  );
}

/** 반 명단. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
async function ClassRosterSection({
  promise,
  query,
}: {
  promise: RosterPromise;
  query: ClassRosterInput;
}) {
  const data = await promise;
  if (!data) return null;

  return (
    // key가 없으면 반을 바꿔도 컴포넌트가 다시 마운트되지 않아, 체크해 둔
    // 학생 id가 남은 채로 화면에 없는 학생에게 벌점이 들어간다.
    <ClassRoster
      key={`${query.track}-${query.year ?? "current"}-${query.grade}-${query.classNo}`}
      rows={data.rows}
      grade={query.grade}
      classNo={query.classNo}
      track={query.track}
      thresholds={data.thresholds}
      year={query.year}
      viewingPast={data.viewingPast}
      rules={data.rules}
    />
  );
}

const GRADES = [1, 2, 3];
const CLASS_NOS = [1, 2, 3, 4];

/**
 * 학년·반 고르기. 폼이 아니라 링크라서 선택 상태가 URL에 남는다.
 *
 * 두 줄 다 「전체」로 시작한다 — 좁힌 뒤 전교로 되돌아올 길이 없으면 고르는 순간
 * 갇힌다. 반 줄은 학년을 고른 뒤에야 선다: 학년 없는 반은 범위가 아니다.
 */
function ClassPicker({ params, track }: { params: Params; track: MeritTrack }) {
  const grade = typeof params.grade === "string" ? params.grade : "";
  const classNo = typeof params.classNo === "string" ? params.classNo : "";

  return (
    <SectionCard variant="panel" title="반 고르기">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-mut">학년</span>
        <ChipLink
          size="sm"
          // 학년을 지우면 반도 함께 지운다 — 남겨 두면 다음에 학년을 고를 때
          // 고른 적 없는 반이 딸려 온다.
          href={meritHref(params, { track, grade: null, classNo: null })}
          active={grade === ""}
        >
          전체
        </ChipLink>
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
      {grade !== "" && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-mut">반</span>
          <ChipLink
            size="sm"
            href={meritHref(params, { track, classNo: null })}
            active={classNo === ""}
          >
            전체
          </ChipLink>
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
      )}
    </SectionCard>
  );
}
