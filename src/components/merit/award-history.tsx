import { CancelButton } from "@/app/(app)/merit/students/[studentId]/cancel-button";
import { Badge } from "@/components/ui/badge";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { formatDate } from "@/lib/datetime";
import type { StudentMeritView } from "@/modules/merit/award.service";

type AwardRow = StudentMeritView["awards"][number];

/**
 * 부여 내역 표. 관리자 화면(취소 가능)과 학생·학부모 화면(조회만)이 공유한다 —
 * canCancel과 studentProfileId(취소 후 revalidatePath 대상)만 다르게 넘긴다.
 * 열: 날짜 · 구분 · 항목 · 점수 · 부여 · 상태 (+ canCancel이면 작업).
 */
export function AwardHistory({
  awards,
  canCancel,
  studentProfileId,
}: {
  awards: AwardRow[];
  canCancel: boolean;
  studentProfileId: string;
}) {
  if (awards.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center text-[12.5px] text-mut">
        내역이 없습니다.
      </div>
    );
  }

  return (
    <section className="rounded-card border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-base font-extrabold text-ink">부여 내역</h2>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <colgroup>
            <col className="w-[96px]" />
            <col className="w-[68px]" />
            <col />
            <col className="w-[64px]" />
            <col className="w-[88px]" />
            <col className="w-[76px]" />
            {canCancel && <col className="w-[64px]" />}
          </colgroup>
          <thead>
            <tr className="border-b border-line2 text-[12px] text-mut">
              <th className="px-5 py-2.5 font-semibold">날짜</th>
              <th className="px-3 py-2.5 font-semibold">구분</th>
              <th className="px-3 py-2.5 font-semibold">항목</th>
              <th className="px-3 py-2.5 font-semibold">점수</th>
              <th className="px-3 py-2.5 font-semibold">부여</th>
              <th className="px-3 py-2.5 font-semibold">상태</th>
              {canCancel && <th className="px-5 py-2.5 font-semibold">작업</th>}
            </tr>
          </thead>
          <tbody>
            {awards.map((award) => {
              const cancelled = award.status === "CANCELLED";
              return (
                <tr key={award.id} className="border-b border-line2 last:border-0">
                  <td className="px-5 py-2.5 whitespace-nowrap text-mut">
                    {formatDate(award.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <KindBadge kind={award.kind} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={
                        cancelled
                          ? "text-mut line-through"
                          : "font-semibold text-ink"
                      }
                    >
                      {award.label}
                    </span>
                    {award.note && (
                      <span className="block text-[12px] text-mut">{award.note}</span>
                    )}
                    {/*
                      취소 사유와 취소한 사람. "관리자면 누구나 취소할 수 있다"는
                      결정의 근거가 바로 이 흔적이므로, DB에만 있고 화면에 없으면
                      그 근거가 실제로는 없는 것과 같다.
                    */}
                    {cancelled && (
                      <span className="block text-[12px] text-rose">
                        취소
                        {award.cancelledByName ? ` · ${award.cancelledByName}` : ""}
                        {award.cancelledAt ? ` · ${formatDate(award.cancelledAt)}` : ""}
                        {award.cancelReason ? ` · ${award.cancelReason}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-bold">
                    {signedPoints(award.kind, award.points)}
                  </td>
                  <td className="px-3 py-2.5 text-mut">{award.awardedByName}</td>
                  <td className="px-3 py-2.5">
                    {cancelled ? (
                      <Badge tone="cancelled">취소</Badge>
                    ) : (
                      <Badge tone="approved">반영</Badge>
                    )}
                  </td>
                  {canCancel && (
                    <td className="px-5 py-2.5">
                      {!cancelled && (
                        <CancelButton awardId={award.id} studentProfileId={studentProfileId} />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
