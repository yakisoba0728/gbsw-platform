import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { EnrollmentTag } from "@/components/merit/enrollment-tag";
import { formatSeat } from "@/lib/student-number";
import { honorificName } from "@/core/authz/roles";

export type StudentSearchRow = {
  studentProfileId: string;
  studentCode: string;
  name: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: string | null;
  /** 그 학년도 재적(ENROLLED)이 아닌가. 있으면 학급 자리에 학적이 대신 선다. */
  removed: boolean;
};

/**
 * 학생 검색 결과. 명단에 있는 학생과 빠진 학생이 한 목록에 섞이므로, 빠진 쪽은
 * **학급 자리에 학적**(졸업·퇴학·전출…)이 서서 구분된다 — 이 표시가 없으면 같은
 * 이름 둘 중 어느 쪽이 지금 재학생인지 알 수 없다. 학적을 적는 것이 「삭제됨」보다
 * 정확하다: 이 학생들은 지워진 것이 아니라 명단에서 빠진 것이다.
 */
export function StudentSearchResults({
  rows,
  hrefFor,
  headingLevel = 2,
}: {
  rows: readonly StudentSearchRow[];
  hrefFor: (row: StudentSearchRow) => string;
  headingLevel?: 2 | 3;
}) {
  const columns: Column<StudentSearchRow>[] = [
    {
      key: "name",
      header: "이름",
      card: "title",
      cell: (row) => (
        <Link
          href={hrefFor(row)}
          className="inline-flex min-h-9 flex-wrap items-center gap-2 font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
        >
          {honorificName(row.name, "STUDENT")}
        </Link>
      ),
    },
    {
      key: "studentCode",
      header: "학생코드",
      width: "w-[140px]",
      card: "meta",
      cardLabel: false,
      cell: (row) => <span className="font-mono text-xs text-mut">{row.studentCode}</span>,
    },
    {
      key: "class",
      header: "학급",
      width: "w-[168px]",
      card: "trailing",
      // 명단에서 빠진 학생은 소속을 비워 낸다(서비스가 재학인 줄에서만 채운다) —
      // 그 빈칸을 학적이 설명한다. 재적 줄이 아예 없으면 붙일 꼬리표가 없어
      // 「재적 없음」을 글자로 적는다(EnrollmentTag는 null에 아무것도 그리지 않는다).
      cell: (row) =>
        row.removed ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-xs whitespace-nowrap text-mut">
            {row.status === null ? "재적 없음" : <EnrollmentTag status={row.status} />}
          </span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-mut">
            {formatSeat(row) ?? "—"}
          </span>
        ),
    },
  ];

  return (
    <SectionCard
      flush
      title="검색 결과"
      headingLevel={headingLevel}
      aside={<span className="text-xs text-mut">{rows.length}명</span>}
    >
      {/* 비어도 카드 제목을 남긴다 — 제목까지 사라지면 무엇이 없는 것인지 모른다. */}
      {rows.length === 0 ? (
        <EmptyState variant="inside">검색 결과가 없습니다.</EmptyState>
      ) : (
        <DataTable
          minWidth={460}
          narrow="cards"
          rows={rows}
          rowKey={(row) => row.studentProfileId}
          columns={columns}
        />
      )}
    </SectionCard>
  );
}
