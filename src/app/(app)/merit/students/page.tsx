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
 * 명단에서 빠진 학생까지 함께 찾는 검색. 화면을 따로 둔 것이 곧 옵트인이다 —
 * /merit의 검색은 줄 상대를 고르는 자리라 명단에 남은 학생만 보여준다.
 * 빠진 쪽에만 "삭제됨"이 붙어 구분된다.
 */
export default async function RemovedStudentSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const raw = await searchParams;
  const q = typeof raw.q === "string" ? raw.q : "";

  // 검색은 소속을 붙이려고 getCurrentYear()를 거친다 — 학년도가 없으면 여기서 잡는다.
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
        className="inline-flex items-center gap-1 text-caption font-medium text-mut transition-colors hover:text-ink"
      >
        <ChevronLeftIcon size={15} />
        상벌점
      </Link>

      <div>
        {/* 제목은 h2부터 — h1은 상단바가 (app) 모든 화면에 이미 그린다. */}
        <h2 className="text-title font-semibold text-ink">
          명단에서 빠진 학생 찾기
        </h2>
        <p className="mt-1 text-caption text-mut">
          지난 기록은 볼 수 있지만 새 상벌점은 부여할 수 없습니다.
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
 * 열: 이름 · 학생코드 · 학급 — 상벌점 화면의 검색 결과와 같은 구성이다.
 * 제외일은 학급 칸에 적는다. 빠진 학생은 그 칸이 언제나 비어 있어서다.
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
                  className="flex flex-wrap items-center gap-2 px-5 py-2.5 font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                >
                  {row.name}
                  {/* 사용자 상세와 같은 배지·같은 문구를 쓴다 — 같은 사실이다. */}
                  {row.removedAt && <Badge tone="rejected">삭제됨</Badge>}
                </Link>
              </td>
              <td className="px-3 py-2.5 font-mono text-xs text-mut">
                {row.studentCode}
              </td>
              <td className="px-5 py-2.5 text-mut">
                {row.removedAt ? (
                  <span className="font-mono whitespace-nowrap">
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
