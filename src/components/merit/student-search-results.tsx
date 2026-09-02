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
  removed: boolean;
};

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
