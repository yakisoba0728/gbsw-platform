import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { isMeritTrack, type MeritTrack } from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { TableFrame } from "@/components/ui/table";
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
  const seenBatches = new Set<string>();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* 이 화면의 쿼리는 track 하나뿐이라 보존할 것이 없다. */}
      <TrackTabs current={track} hrefFor={(t) => `/merit/recent?track=${t}`} />

      {rows.length === 0 ? (
        <EmptyState>부여된 상벌점이 없습니다.</EmptyState>
      ) : (
        <SectionCard title={`최근 부여 ${rows.length}건`} flush>
          {/* table-fixed라 넘치는 글자는 잘린다 — colgroup으로 자리를 고정한다. */}
          <TableFrame
            fixed
            minWidth={800}
            cols={[
              "w-[128px]",
              "w-[72px]",
              "w-[96px]",
              undefined,
              "w-[68px]",
              "w-[92px]",
              "w-[108px]",
            ]}
            headers={[
              "시각",
              "구분",
              "학생",
              "항목",
              <span key="points" className="block text-right">
                점수
              </span>,
              "부여자",
              "상태",
            ]}
          >
            <tbody>
              {rows.map((row) => {
                const cancelled = row.status === "CANCELLED";
                // 묶음의 첫 줄에만 일괄 취소를 붙인다. 같은 버튼이 30번 뜨면
                // 무엇을 누르는지가 오히려 흐려진다.
                const batchSize = row.batchId ? (batchSizes.get(row.batchId) ?? 0) : 0;
                const showBatchCancel =
                  !cancelled &&
                  row.batchId !== null &&
                  batchSize > 1 &&
                  !seenBatches.has(row.batchId);
                if (row.batchId) seenBatches.add(row.batchId);

                return (
                  <tr key={row.id} className="border-b border-line2 last:border-0">
                    {/* 이 목록만 입력순이다 — 앞에 서는 시각도 입력 시각이고,
                        발생일이 다른 날이면 덧붙인다. */}
                    <td className="px-5 py-2.5 align-top font-mono text-xs whitespace-nowrap text-mut">
                      {formatDateTime(row.createdAt)}
                      {!isSameKstDate(row.occurredOn, row.createdAt) && (
                        <span className="block text-mut2">
                          발생 {formatDate(row.occurredOn)}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-top">
                      <KindBadge kind={row.kind} />
                    </td>

                    <td className="px-3 py-2.5 align-top">
                      <Link
                        href={`/merit/students/${row.studentProfileId}?track=${track}`}
                        className="block truncate font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                      >
                        {row.studentName}
                      </Link>
                    </td>

                    <td
                      className={`truncate px-3 py-2.5 align-top text-caption ${
                        cancelled ? "text-mut line-through" : "text-ink"
                      }`}
                      title={row.label}
                    >
                      {row.label}
                    </td>

                    <td
                      className={`px-3 py-2.5 text-right align-top font-medium whitespace-nowrap ${
                        cancelled ? "text-mut" : kindColorClass(row.kind)
                      }`}
                    >
                      {signedPoints(row.kind, row.points)}
                    </td>

                    <td className="truncate px-3 py-2.5 align-top text-xs text-mut">
                      {row.awardedByName}
                    </td>

                    <td className="px-5 py-2.5 align-top">
                      {cancelled ? (
                        <Badge tone="cancelled">취소</Badge>
                      ) : showBatchCancel && row.batchId ? (
                        // 묶음 건수를 버튼에 적는다 — 배지로는 무엇을 하라는 건지가 없다.
                        <CancelBatchButton batchId={row.batchId} count={batchSize} />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableFrame>
        </SectionCard>
      )}
    </div>
  );
}
