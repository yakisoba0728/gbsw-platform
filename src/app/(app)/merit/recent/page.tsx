import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { isMeritTrack, type MeritTrack } from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { CancelButton } from "@/components/merit/cancel-button";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { formatDate, formatDateTimeShort, isSameKstDate } from "@/lib/datetime";
import { listRecentAwards } from "@/modules/merit/award.service";
import { EMPTY_MERIT_STATE } from "../action-state";
import { cancelAction } from "../actions";

export const metadata: Metadata = { title: "최근 부여" };

export default async function RecentAwardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";

  // AcademicYearError를 잡지 않는다 — listRecentAwards는 getCurrentYear()를 타지 않는다.
  const rows = await listRecentAwards(actor, track);

  const columns: Column<(typeof rows)[number]>[] = [
    {
      // 이 목록만 입력순이다 — 앞에 서는 시각도 입력 시각이고, 발생일이 다르면 덧붙인다.
      key: "createdAt",
      header: "시각",
      width: "w-[128px]",
      card: "meta",
      cardLabel: false,
      cell: (row) => (
        // whitespace-nowrap을 쓰지 않는다 — table-layout이 auto라 nowrap인 칸은
        // colgroup의 128px을 무시하고 198px까지 벌어지고, 그만큼 「항목」이 눌려
        // 1024px에서 규정 한 줄이 6줄로 접혔다.
        <span className="font-mono text-xs text-mut">
          {formatDateTimeShort(row.createdAt)}
          {!isSameKstDate(row.occurredOn, row.createdAt) && (
            <span className="block text-mut2">발생 {formatDate(row.occurredOn)}</span>
          )}
        </span>
      ),
    },
    {
      key: "kind",
      header: "구분",
      width: "w-[72px]",
      cell: (row) => <KindBadge kind={row.kind} />,
    },
    {
      key: "student",
      header: "학생",
      width: "w-[96px]",
      card: "title",
      cell: (row) => (
        <Link
          href={`/merit/students/${row.studentProfileId}?track=${track}`}
          className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
        >
          {row.studentName}
        </Link>
      ),
    },
    {
      key: "label",
      header: "항목",
      card: "meta",
      cardLabel: false,
      cell: (row) => (
        <span
          className={`text-caption ${
            row.status === "CANCELLED" ? "text-mut line-through" : "text-ink"
          }`}
        >
          {row.label}
        </span>
      ),
    },
    {
      key: "points",
      header: <span className="block text-right">점수</span>,
      width: "w-[68px]",
      card: "trailing",
      cell: (row) => (
        <span
          className={`block text-right font-medium whitespace-nowrap lg:text-right ${
            row.status === "CANCELLED" ? "text-mut" : kindColorClass(row.kind)
          }`}
        >
          {signedPoints(row.kind, row.points)}
        </span>
      ),
    },
    {
      key: "awardedBy",
      header: "부여자",
      width: "w-[92px]",
      card: "meta",
      cell: (row) => <span className="text-xs text-mut">{row.awardedByName}</span>,
    },
    {
      key: "status",
      header: "상태",
      width: "w-[108px]",
      card: "actions",
      // 이 화면의 존재 이유가 "점호 직후 잘못 준 것을 되돌리는 것"이라(nav.ts)
      // 줄마다 취소가 있어야 한다. 여러 명에게 준 것도 이제 서로 독립이므로
      // 되돌리는 것도 한 건씩이다.
      cell: (row) =>
        row.status === "CANCELLED" ? (
          <Badge tone="cancelled">취소</Badge>
        ) : (
          <CancelButton
            awardId={row.id}
            studentProfileId={row.studentProfileId}
            cancelAction={cancelAction}
            initialState={EMPTY_MERIT_STATE}
          />
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* 이 화면의 쿼리는 track 하나뿐이라 보존할 것이 없다. */}
      <TrackTabs current={track} hrefFor={(t) => `/merit/recent?track=${t}`} />

      {rows.length === 0 ? (
        <EmptyState>부여된 상벌점이 없습니다.</EmptyState>
      ) : (
        <SectionCard title={`최근 부여 ${rows.length}건`} flush>
          <DataTable
            minWidth={700}
            narrow="cards"
            rows={rows}
            rowKey={(row) => row.id}
            columns={columns}
          />
        </SectionCard>
      )}
    </div>
  );
}
