import Link from "next/link";
import type { SessionUser } from "@/core/auth/session";
import {
  isYearScoped,
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import { classRosterSchema } from "@/modules/merit/merit.schema";
import { getClassRoster, searchStudents } from "@/modules/merit/award.service";
import { listActiveRules } from "@/modules/merit/rule.service";
import { ClassRoster } from "./class-roster";

type Params = Record<string, string | string[] | undefined>;

/**
 * 탭·필터 링크. **다른 쿼리 파라미터를 보존한다** — 반을 고른 채 트랙 탭만 눌러도
 * 그 반이 유지되어야 한다. 보존하지 않으면 탭을 옮길 때마다 반을 다시 골라야 한다.
 */
function hrefWith(params: Params, patch: Record<string, string>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  for (const [key, value] of Object.entries(patch)) query.set(key, value);
  return `/merit?${query.toString()}`;
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
      <div className="flex items-center gap-2">
        {MERIT_TRACKS.map((t) => (
          <Link
            key={t}
            href={hrefWith(params, { track: t })}
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

      {noCurrentYear && <NoAcademicYearNotice />}

      {/* 검색 — GET 폼이라 결과가 URL에 남고 새로고침·뒤로가기가 자연스럽다 */}
      <form method="get" className="flex gap-2">
        <input type="hidden" name="track" value={track} />
        <input
          name="q"
          defaultValue={q}
          placeholder="이름 또는 학생코드로 검색"
          className="flex-1 rounded-input border border-line bg-surface px-3.5 py-2.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-input bg-pri px-4 py-2.5 text-[13px] font-bold text-white"
        >
          검색
        </button>
      </form>

      {q && <SearchResults rows={results} track={track} />}

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
    return (
      <div className="rounded-card border border-line bg-surface p-6 text-center text-[12.5px] text-mut">
        검색 결과가 없습니다.
      </div>
    );
  }

  return (
    <section className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full min-w-[420px] text-left text-sm">
        <colgroup>
          <col />
          <col className="w-[140px]" />
          <col className="w-[140px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-line2 text-[12px] text-mut">
            <th className="px-5 py-2.5 font-semibold">이름</th>
            <th className="px-3 py-2.5 font-semibold">학생코드</th>
            <th className="px-3 py-2.5 font-semibold">학급</th>
          </tr>
        </thead>
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
              <td className="px-3 py-2.5 text-mut">
                {row.grade !== null && row.classNo !== null && row.number !== null
                  ? `${row.grade}학년 ${row.classNo}반 ${row.number}번`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
          <Link
            key={g}
            href={hrefWith(params, { track, grade: String(g) })}
            className={
              grade === String(g)
                ? "rounded-full bg-pri px-3.5 py-1.5 text-[12.5px] font-bold text-white"
                : "rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-mut hover:border-pri hover:text-pri"
            }
          >
            {g}학년
          </Link>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-semibold text-mut">반</span>
        {CLASS_NOS.map((c) => (
          <Link
            key={c}
            href={hrefWith(params, { track, classNo: String(c) })}
            className={
              classNo === String(c)
                ? "rounded-full bg-pri px-3.5 py-1.5 text-[12.5px] font-bold text-white"
                : "rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-mut hover:border-pri hover:text-pri"
            }
          >
            {c}반
          </Link>
        ))}
      </div>
    </section>
  );
}
