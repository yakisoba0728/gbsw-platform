import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { EnrollmentTag } from "@/components/merit/enrollment-tag";
import { formatDate } from "@/lib/datetime";

export type StudentSearchRow = {
  studentProfileId: string;
  studentCode: string;
  name: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: string | null;
  /** 명단에서 빠진 날. 있으면 학급 자리에 이 날짜가 대신 선다. */
  removedAt: Date | null;
};

/**
 * 학생 검색 결과. 명단에 있는 학생과 빠진 학생이 한 목록에 섞이므로, 빠진 쪽은
 * 「삭제됨」과 명단 제외일로 구분된다 — 이 표시가 없으면 같은 이름 둘 중 어느 쪽이
 * 지금 재학생인지 알 수 없다.
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
          {row.name}
          {row.removedAt && <Badge tone="rejected">삭제됨</Badge>}
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
        row.removedAt ? (
          <span className="font-mono text-xs whitespace-nowrap text-mut">
            {formatDate(row.removedAt)} 명단 제외
          </span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-mut">
            {row.grade !== null && row.classNo !== null && row.number !== null
              ? `${row.grade}학년 ${row.classNo}반 ${row.number}번`
              : "—"}
            {/* 졸업·자퇴 학생도 검색에 걸린다 — 안 보이면 동명이인을 고를 때 못 알아챈다. */}
            <EnrollmentTag status={row.status} />
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
