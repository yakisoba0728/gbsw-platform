import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { BackLink } from "@/components/ui/back-link";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SearchForm } from "@/components/ui/search-form";
import { StudentSearchResults } from "@/components/merit/student-search-results";
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
      <BackLink href="/merit">상벌점</BackLink>

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

      {q && !noCurrentYear && (
        <StudentSearchResults
          rows={results}
          hrefFor={(row) => `/merit/students/${row.studentProfileId}`}
          headingLevel={3}
        />
      )}
    </div>
  );
}
