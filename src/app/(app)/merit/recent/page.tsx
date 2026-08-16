import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { isMeritTrack, type MeritTrack } from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { formatDate, formatDateTime, isSameKstDate } from "@/lib/datetime";
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
      {/* 이 화면의 쿼리는 track 하나뿐이라 보존할 것이 없다. */}
      <TrackTabs current={track} hrefFor={(t) => `/merit/recent?track=${t}`} />

      {!rows ? (
        <NoAcademicYearNotice />
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-8 text-center text-[12.5px] text-mut">
          아직 부여된 상벌점이 없습니다.
        </div>
      ) : (
        <section className="rounded-card border border-line bg-surface">
          <header className="border-b border-line px-5 py-4">
            <h2 className="text-base font-extrabold text-ink">최근 부여 {rows.length}건</h2>
          </header>

          {/*
            표로 그린다. flex 목록이었을 때는 항목명 길이에 따라 점수·부여자가
            줄마다 다른 자리에 섰다 — 눈으로 세로로 훑을 수가 없었다.
            colgroup으로 자리를 고정하고, 넘치는 글자는 잘라낸다.
          */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[124px]" />
                <col className="w-[64px]" />
                <col className="w-[92px]" />
                <col />
                <col className="w-[64px]" />
                <col className="w-[88px]" />
                <col className="w-[104px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-line2 text-[12px] text-mut">
                  <th className="px-5 py-2.5 font-semibold">시각</th>
                  <th className="px-2 py-2.5 font-semibold">구분</th>
                  <th className="px-2 py-2.5 font-semibold">학생</th>
                  <th className="px-2 py-2.5 font-semibold">항목</th>
                  <th className="px-2 py-2.5 text-right font-semibold">점수</th>
                  <th className="px-2 py-2.5 font-semibold">부여자</th>
                  <th className="px-5 py-2.5 font-semibold">상태</th>
                </tr>
              </thead>
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
                      {/*
                        이 목록만 입력순이다 ("방금 무엇이 들어왔나"를 보는 화면).
                        그래서 앞에 서는 시각도 입력 시각이고, 발생일이 다른 날이면
                        그것을 덧붙인다 — 두 날짜가 갈린 기록을 여기서 알아채야
                        잘못 넣은 것을 바로 되돌릴 수 있다.
                      */}
                      <td className="px-5 py-2.5 align-top text-[12px] whitespace-nowrap text-mut">
                        {formatDateTime(row.createdAt)}
                        {!isSameKstDate(row.occurredOn, row.createdAt) && (
                          <span className="block text-mut2">
                            발생 {formatDate(row.occurredOn)}
                          </span>
                        )}
                      </td>

                      <td className="px-2 py-2.5 align-top">
                        <KindBadge kind={row.kind} />
                      </td>

                      <td className="px-2 py-2.5 align-top">
                        <Link
                          href={`/merit/students/${row.studentProfileId}?track=${track}`}
                          className="block truncate font-semibold text-ink hover:text-pri hover:underline"
                        >
                          {row.studentName}
                        </Link>
                      </td>

                      <td
                        className={`truncate px-2 py-2.5 align-top text-[13px] ${
                          cancelled ? "text-mut line-through" : "text-ink"
                        }`}
                        title={row.label}
                      >
                        {row.label}
                      </td>

                      <td
                        className={`px-2 py-2.5 text-right align-top font-bold whitespace-nowrap ${
                          cancelled ? "text-mut" : kindColorClass(row.kind)
                        }`}
                      >
                        {signedPoints(row.kind, row.points)}
                      </td>

                      <td className="truncate px-2 py-2.5 align-top text-[12px] text-mut">
                        {row.awardedByName}
                      </td>

                      <td className="px-5 py-2.5 align-top">
                        {cancelled ? (
                          <Badge tone="cancelled">취소</Badge>
                        ) : showBatchCancel && row.batchId ? (
                          // 같은 묶음으로 나간 건수를 버튼에 적는다 — 배지로
                          // "일괄 4"만 띄우면 그래서 뭘 하라는 건지가 없다.
                          <CancelBatchButton batchId={row.batchId} count={batchSize} />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
