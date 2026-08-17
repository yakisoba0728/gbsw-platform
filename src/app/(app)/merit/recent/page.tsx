import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { isMeritTrack, type MeritTrack } from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { formatDate, formatDateTime, isSameKstDate } from "@/lib/datetime";
import { listRecentAwards } from "@/modules/merit/award.service";
import { CancelBatchButton } from "./cancel-batch-button";

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

  // 같은 묶음이 몇 건인지 세어 둔다 — 취소 버튼에 건수를 적어야 무엇을 되돌리는지 안다.
  const batchSizes = new Map<string, number>();
  for (const row of rows) {
    if (row.batchId && row.status === "ACTIVE") {
      batchSizes.set(row.batchId, (batchSizes.get(row.batchId) ?? 0) + 1);
    }
  }

  // 묶음의 첫 줄에만 일괄 취소를 붙인다. 같은 버튼이 30번 뜨면 무엇을 누르는지가
  // 오히려 흐려진다. 표와 카드가 같은 행을 두 번 그리므로 판정은 여기서 끝낸다.
  const seenBatches = new Set<string>();
  const items = rows.map((row) => {
    const batchSize = row.batchId ? (batchSizes.get(row.batchId) ?? 0) : 0;
    const showBatchCancel =
      row.status !== "CANCELLED" &&
      row.batchId !== null &&
      batchSize > 1 &&
      !seenBatches.has(row.batchId);
    if (row.batchId) seenBatches.add(row.batchId);
    return { ...row, batchSize, showBatchCancel };
  });

  const columns: Column<(typeof items)[number]>[] = [
    {
      // 이 목록만 입력순이다 — 앞에 서는 시각도 입력 시각이고, 발생일이 다르면 덧붙인다.
      key: "createdAt",
      header: "시각",
      width: "w-[128px]",
      card: "meta",
      cardLabel: false,
      cell: (row) => (
        <span className="font-mono text-xs whitespace-nowrap text-mut">
          {formatDateTime(row.createdAt)}
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
      cell: (row) =>
        row.status === "CANCELLED" ? (
          <Badge tone="cancelled">취소</Badge>
        ) : row.showBatchCancel && row.batchId ? (
          // 묶음 건수를 버튼에 적는다 — 배지로는 무엇을 하라는 건지가 없다.
          <CancelBatchButton batchId={row.batchId} count={row.batchSize} />
        ) : null,
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
            minWidth={720}
            narrow="cards"
            rows={items}
            rowKey={(row) => row.id}
            columns={columns}
          />
        </SectionCard>
      )}
    </div>
  );
}
