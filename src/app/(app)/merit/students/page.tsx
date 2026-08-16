import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { ChevronLeftIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SearchForm } from "@/components/ui/search-form";
import { TableFrame } from "@/components/ui/table";
import { EnrollmentTag } from "@/components/merit/enrollment-tag";
import { formatDate } from "@/lib/datetime";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { searchStudents } from "@/modules/merit/award.service";

export const metadata: Metadata = { title: "명단에서 빠진 학생 찾기" };

/**
 * 명단에서 빠진(자퇴·전출 등으로 소프트 삭제된) 학생까지 함께 찾는 검색.
 *
 * **이 화면이 존재하는 이유가 곧 옵트인이다.** 상벌점 화면(`/merit`)의 검색은
 * 명단에 남아 있는 학생만 보여준다 — 상벌점을 줄 상대를 고르는 자리라 자퇴생이
 * 조용히 끼면 동명이인 사고가 난다. 그런데 그 필터 때문에 자퇴생의 벌점 내역에
 * 닿는 경로가 아예 없어져서, 선도관리위원회 자료를 다시 뽑을 방법이 감사로그를
 * 눈으로 훑는 것뿐이었다(감사 M-2). 두 요구를 한 검색에 욱여넣는 대신 화면을
 * 나눈다 — 여기까지 걸어 들어온 것이 "지난 기록을 찾으러 왔다"는 뜻이다.
 *
 * 명단에 남아 있는 학생도 함께 나온다. 찾는 사람이 그 학생이 이미 빠졌는지를
 * 모르는 채로 오기 때문이다 — 빠진 쪽에만 "삭제됨"이 붙어 구분된다.
 *
 * `merit:read:any`(=관리자)만 들어온다. 학생 본인·학부모 경로는 이 화면을 타지
 * 않으며 서비스도 같은 검사를 다시 한다.
 */
export default async function RemovedStudentSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const raw = await searchParams;
  const q = typeof raw.q === "string" ? raw.q : "";

  // 검색은 소속을 붙이려고 getCurrentYear()를 거친다 — 학년도가 아직 없으면
  // 던지므로 화면이 죽지 않게 여기서 잡는다 (상벌점 화면들과 같은 처리).
  let results: Awaited<ReturnType<typeof searchStudents>> = [];
  let noCurrentYear = false;
  if (q) {
    try {
      results = await searchStudents(actor, q, { includeRemoved: true });
    } catch (error) {
      if (!(error instanceof AcademicYearError)) throw error;
      noCurrentYear = true;
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link
        href="/merit"
        className="inline-flex items-center gap-1 text-[13px] font-semibold text-mut transition-colors hover:text-pri"
      >
        <ChevronLeftIcon size={15} />
        상벌점
      </Link>

      <div>
        {/* 제목은 h2부터 — h1은 상단바가 (app) 모든 화면에 이미 그린다. */}
        <h2 className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">
          명단에서 빠진 학생 찾기
        </h2>
        <p className="mt-1 text-[13px] text-mut">
          자퇴·전출 등으로 명단에서 빠진 학생까지 함께 찾습니다. 상벌점 화면의
          검색에는 명단에 남아 있는 학생만 나옵니다. 지난 기록은 그대로 볼 수
          있지만 새 상벌점은 부여할 수 없습니다.
        </p>
      </div>

      <SearchForm
        defaultValue={q}
        placeholder="이름 또는 학생코드로 검색"
        ariaLabel="명단에서 빠진 학생을 포함한 이름 또는 학생코드 검색"
      />

      {noCurrentYear && <NoAcademicYearNotice />}

      {q && !noCurrentYear && <Results rows={results} />}
    </div>
  );
}

/**
 * 열: 이름 · 학생코드 · 학급. **상벌점 화면의 검색 결과와 같은 열 구성이다** —
 * 같은 일을 하는 표라 열이 갈리면 어느 화면에 있는지가 흐려진다.
 *
 * 제외일에 열을 따로 주지 않는다. 소프트 삭제는 그 학년도 Enrollment를 실제로
 * 지우므로 빠진 학생의 학급 칸은 **언제나 비어 있고**, 그 자리에 날짜를 적으면
 * 빈칸이 설명되면서 열도 늘지 않는다 (열을 하나 더 두면 명단에 남은 학생 줄이
 * 전부 "—"인 칸을 끌고 다니고, 좁은 화면에서는 표가 가로로 밀린다).
 */
function Results({ rows }: { rows: Awaited<ReturnType<typeof searchStudents>> }) {
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
            <tr
              key={row.studentProfileId}
              className="border-b border-line2 last:border-0"
            >
              <td className="p-0">
                <Link
                  href={`/merit/students/${row.studentProfileId}`}
                  className="flex flex-wrap items-center gap-2 px-5 py-2.5 font-semibold text-ink hover:text-pri"
                >
                  {row.name}
                  {/* 사용자 상세와 같은 배지·같은 문구를 쓴다 — 같은 사실이다. */}
                  {row.removedAt && <Badge tone="rejected">삭제됨</Badge>}
                </Link>
              </td>
              <td className="px-3 py-2.5 font-mono text-[12.5px] text-mut">
                {row.studentCode}
              </td>
              <td className="px-5 py-2.5 text-mut">
                {row.removedAt ? (
                  <span className="whitespace-nowrap">
                    {formatDate(row.removedAt)} 명단 제외
                  </span>
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {row.grade !== null && row.classNo !== null && row.number !== null
                      ? `${row.grade}학년 ${row.classNo}반 ${row.number}번`
                      : "—"}
                    {/* 졸업·자퇴는 명단에 남아 있는 상태다 — 삭제와 다르다. */}
                    <EnrollmentTag status={row.status} />
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    </section>
  );
}
