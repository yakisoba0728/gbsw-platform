import Link from "next/link";
import type { SessionUser } from "@/core/auth/session";
import { isYearScoped, type MeritTrack } from "@/core/authz/merit-track";
import { ChipLink } from "@/components/ui/chip-link";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SearchForm } from "@/components/ui/search-form";
import { TableFrame } from "@/components/ui/table";
import { EnrollmentTag } from "@/components/merit/enrollment-tag";
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
import { ClassRoster } from "./class-roster";

type Params = SearchParamsInput;

/**
 * 탭·필터 링크. **다른 쿼리 파라미터를 하나도 지우지 않는다** — 반을 고른 채
 * 트랙 탭만 눌러도 그 반이 유지되어야 한다. 이 화면은 학년도까지 보존한다
 * (지난 학년도를 보는 중이면 탭·반을 옮겨도 그 해에 머문다).
 */
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

  // 검색·반별 목록 둘 다 내부적으로 getCurrentYear()를 거친다(searchStudents는
  // 항상, getClassRoster는 연도를 안 골랐을 때). 학년도가 아직 없으면 던지므로
  // 화면이 죽지 않게 여기서 잡는다 — 페이지 전체가 아니라 안내만 보여준다.
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

  // 지난 학년도를 보고 있으면 일괄 부여 폼을 감춘다 — 부여는 항상 현재 학년도로
  // 들어가므로 결과가 이 화면에 나타나지 않는다. hrefWith가 year를 계속 보존하므로
  // 한 번 들어온 학년도는 탭·반을 옮겨도 따라다닌다.
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

      {/*
        검색 — GET 폼이라 결과가 URL에 남고 새로고침·뒤로가기가 자연스럽다.
        트랙만 함께 싣는다: 검색은 전교를 대상으로 하므로 골라 둔 학년·반을
        들고 가면 "검색했는데 아래에 엉뚱한 반이 남아 있는" 화면이 된다.
      */}
      <SearchForm
        defaultValue={q}
        placeholder="이름 또는 학생코드로 검색"
        ariaLabel="학생 이름 또는 학생코드 검색"
        hidden={{ track }}
      />

      {q && <SearchResults rows={results} track={track} />}

      {/*
        이 검색은 명단에 있는 학생만 찾는다 — 줄 상대를 고르는 자리이므로
        그게 맞다. 지난 기록을 다시 꺼내는 일(자퇴생의 벌점 내역을 선도위원회
        자료로 뽑는 등)은 요구가 반대라 화면을 나눴고, 여기서 그쪽으로 가는
        길만 둔다. 이 한 줄이 없으면 그 화면은 주소를 직접 쳐야만 닿는다.
      */}
      {q && (
        <p className="text-[12.5px] text-mut">
          찾는 학생이 없나요?{" "}
          <Link
            href={`/merit/students?q=${encodeURIComponent(q)}`}
            className="font-semibold text-pri hover:underline"
          >
            명단에서 빠진 학생까지 찾기
          </Link>
        </p>
      )}

      {/* 학년·반 고르기 — 1~3학년, 반은 1~4반(현재 학년당 반 수) */}
      <ClassPicker params={params} track={track} />

      {roster && rosterQuery.success && (
        // key가 없으면 반을 바꿔도 같은 자리의 같은 컴포넌트라 React가 다시
        // 마운트하지 않는다 — 체크해 둔 학생 id(selected)가 그대로 남고, 화면에는
        // 새 반이 보이는데 hidden input은 이전 반 학생을 실어 보낸다. 즉 화면에
        // 없는 학생에게 벌점이 들어간다. 반·트랙·학년도가 바뀌면 새 컴포넌트다.
        <ClassRoster
          key={`${track}-${rosterQuery.data.year ?? "current"}-${rosterQuery.data.grade}-${rosterQuery.data.classNo}`}
          rows={roster}
          grade={rosterQuery.data.grade}
          classNo={rosterQuery.data.classNo}
          track={track}
          year={rosterQuery.data.year}
          viewingPast={viewingPast}
          rules={rules}
          // 오늘 날짜는 서버에서 만든다 — 클라이언트에서 만들면 SSR이 그린 값과
          // 어긋나 하이드레이션이 깨진다 (시안의 device 토글을 JS로 재현하지
          // 않는 것과 같은 이유).
          today={formatDateInput(new Date())}
        />
      )}
    </div>
  );
}

/** 열: 이름 · 학생코드 · 학급. 각 줄이 학생 상세로 가는 링크다. */
function SearchResults({
  rows,
  track,
}: {
  rows: Awaited<ReturnType<typeof searchStudents>>;
  track: MeritTrack;
}) {
  if (rows.length === 0) {
    return <EmptyState>검색 결과가 없습니다.</EmptyState>;
  }

  return (
    <section className="rounded-card border border-line bg-surface">
      <TableFrame
        minWidth={460}
        cols={[undefined, "w-[140px]", "w-[168px]"]}
        headers={["이름", "학생코드", "학급"]}
      >
        <tbody>
          {rows.map((row) => (
            <tr key={row.studentProfileId} className="border-b border-line2 last:border-0">
              <td className="p-0">
                <Link
                  href={`/merit/students/${row.studentProfileId}?track=${track}`}
                  className="block px-5 py-2.5 font-semibold text-ink hover:text-pri"
                >
                  {row.name}
                </Link>
              </td>
              <td className="px-3 py-2.5 font-mono text-[12.5px] text-mut">
                {row.studentCode}
              </td>
              <td className="px-5 py-2.5 text-mut">
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {row.grade !== null && row.classNo !== null && row.number !== null
                    ? `${row.grade}학년 ${row.classNo}반 ${row.number}번`
                    : "—"}
                  {/*
                    졸업·자퇴한 학생도 검색에 걸린다(지난 기록을 봐야 하므로).
                    부여 자체는 학적을 안 보므로, 여기서 보이지 않으면 동명이인을
                    고를 때 알아챌 방법이 없다.
                  */}
                  <EnrollmentTag status={row.status} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    </section>
  );
}

const GRADES = [1, 2, 3];
const CLASS_NOS = [1, 2, 3, 4];

/** 학년·반 고르기. 폼이 아니라 링크라서 선택 상태가 URL에 남는다. */
function ClassPicker({ params, track }: { params: Params; track: MeritTrack }) {
  const grade = typeof params.grade === "string" ? params.grade : "";
  const classNo = typeof params.classNo === "string" ? params.classNo : "";

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-semibold text-mut">학년</span>
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
        <span className="mr-1 text-[12px] font-semibold text-mut">반</span>
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
    </section>
  );
}
