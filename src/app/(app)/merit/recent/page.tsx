import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritTrack,
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { Badge } from "@/components/ui/badge";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { formatDateTime } from "@/lib/datetime";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
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

  let rows: Awaited<ReturnType<typeof listRecentAwards>> | null = null;
  try {
    rows = await listRecentAwards(actor, track);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  // 같은 묶음이 몇 건인지 세어 둔다 — 일괄 취소 버튼에 건수를 적어야
  // "이 버튼이 몇 명을 되돌리는지" 누르기 전에 알 수 있다.
  const batchSizes = new Map<string, number>();
  for (const row of rows ?? []) {
    if (row.batchId && row.status === "ACTIVE") {
      batchSizes.set(row.batchId, (batchSizes.get(row.batchId) ?? 0) + 1);
    }
  }
  const seenBatches = new Set<string>();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-2">
        {MERIT_TRACKS.map((t) => (
          <Link
            key={t}
            href={`/merit/recent?track=${t}`}
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

      {!rows ? (
        <NoAcademicYearNotice />
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-8 text-center text-[12.5px] text-mut">
          아직 부여된 상벌점이 없습니다.
        </div>
      ) : (
        <section className="rounded-card border border-line bg-surface">
          <header className="border-b border-line px-5 py-4">
            <h2 className="text-base font-extrabold text-ink">최근 부여</h2>
            <p className="mt-1 text-[12px] text-mut">
              최근 {rows.length}건. 취소된 것도 함께 보여줍니다 — 취소 역시
              일어난 일입니다.
            </p>
          </header>

          <ul>
            {rows.map((row) => {
              const cancelled = row.status === "CANCELLED";
              // 묶음의 첫 줄에만 일괄 취소를 붙인다. 같은 버튼이 30번 뜨면
              // 무엇을 누르는지가 오히려 흐려진다.
              const batchSize = row.batchId ? (batchSizes.get(row.batchId) ?? 0) : 0;
              const showBatchCancel =
                !cancelled && row.batchId !== null && batchSize > 1 && !seenBatches.has(row.batchId);
              if (row.batchId) seenBatches.add(row.batchId);

              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line2 px-5 py-3 last:border-0"
                >
                  <span className="w-[132px] shrink-0 text-[12px] text-mut">
                    {formatDateTime(row.createdAt)}
                  </span>

                  <KindBadge kind={row.kind} />

                  <Link
                    href={`/merit/students/${row.studentProfileId}?track=${track}`}
                    className="font-semibold text-ink hover:text-pri hover:underline"
                  >
                    {row.studentName}
                  </Link>

                  <span
                    className={
                      cancelled
                        ? "flex-1 text-[13px] text-mut line-through"
                        : "flex-1 text-[13px] text-ink"
                    }
                  >
                    {row.label}
                  </span>

                  <span
                    className={`shrink-0 font-bold ${cancelled ? "text-mut" : kindColorClass(row.kind)}`}
                  >
                    {signedPoints(row.kind, row.points)}
                  </span>

                  <span className="w-[80px] shrink-0 text-right text-[12px] text-mut">
                    {row.awardedByName}
                  </span>

                  {cancelled ? (
                    <Badge tone="cancelled">취소</Badge>
                  ) : batchSize > 1 ? (
                    <Badge tone="info">일괄 {batchSize}</Badge>
                  ) : (
                    <span className="w-[52px]" />
                  )}

                  {showBatchCancel && row.batchId && (
                    <CancelBatchButton batchId={row.batchId} count={batchSize} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
