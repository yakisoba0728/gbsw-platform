import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { TableFrame, tableCellPadding } from "@/components/ui/table";
import { CancelButton } from "@/components/merit/cancel-button";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { formatDate, isSameKstDate } from "@/lib/datetime";
import type { StudentMeritView } from "@/modules/merit/award.service";

type AwardRow = StudentMeritView["awards"][number];

/** 취소 버튼에 그대로 넘길 두 값. 계약은 CancelButton이 정한다. */
type CancelProps = ComponentProps<typeof CancelButton>;

/**
 * 부여 내역 표. 관리자 화면(취소 가능)과 학생·학부모 화면(조회만)이 공유하며,
 * 취소 가능 여부는 액션의 유무로 판단한다. 날짜 칸은 발생일이고, 입력일이 다른
 * 날이면 함께 적는다 — 나중에 날짜를 다툴 때 화면이 줄 수 있는 유일한 근거다.
 */
export function AwardHistory({
  awards,
  studentProfileId,
  cancelAction,
  initialState,
}: {
  awards: AwardRow[];
  studentProfileId: string;
  /** 주면 "작업" 열이 생긴다. 학생·학부모 화면은 넘기지 않는다. */
  cancelAction?: CancelProps["cancelAction"];
  /** cancelAction의 초기 상태. 액션과 함께 온다 (CancelButton 주석 참고). */
  initialState?: CancelProps["initialState"];
}) {
  const canCancel = cancelAction !== undefined && initialState !== undefined;
  if (awards.length === 0) {
    return <EmptyState>내역이 없습니다.</EmptyState>;
  }

  // 취소 열이 있고 없고에 따라 마지막 열이 달라진다 — 첫·끝 열만 px-5인
  // 규칙(tableCellPadding)이 그 자리를 보고 정해지므로 열 수를 세어 둔다.
  const columns = canCancel ? 7 : 6;

  return (
    <SectionCard title="부여 내역" flush>
      <TableFrame
        minWidth={canCancel ? 604 : 560}
        cols={[
          "w-[112px]",
          "w-[68px]",
          undefined,
          "w-[64px]",
          "w-[88px]",
          canCancel ? "w-[76px]" : "w-[92px]",
          ...(canCancel ? (["w-[104px]"] as const) : []),
        ]}
        headers={[
          "발생일",
          "구분",
          "항목",
          "점수",
          "부여",
          "상태",
          ...(canCancel ? (["작업"] as const) : []),
        ]}
      >
        <tbody>
          {awards.map((award) => {
            const cancelled = award.status === "CANCELLED";
            return (
              <tr key={award.id} className="border-b border-line2 last:border-0">
                <td className="px-5 py-2.5 font-mono whitespace-nowrap text-mut">
                  {formatDate(award.occurredOn)}
                  {!isSameKstDate(award.occurredOn, award.createdAt) && (
                    <span className="block text-xs text-mut2">
                      입력 {formatDate(award.createdAt)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <KindBadge kind={award.kind} />
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={
                      cancelled ? "text-mut line-through" : "font-medium text-ink"
                    }
                  >
                    {award.label}
                  </span>
                  {award.note && (
                    <span className="block text-xs text-mut">{award.note}</span>
                  )}
                  {/* "관리자면 누구나 취소할 수 있다"의 근거가 이 흔적이다 — 화면에 낸다. */}
                  {cancelled && (
                    <span className="block text-xs text-rose">
                      취소
                      {award.cancelledByName ? ` · ${award.cancelledByName}` : ""}
                      {award.cancelledAt ? ` · ${formatDate(award.cancelledAt)}` : ""}
                      {award.cancelReason ? ` · ${award.cancelReason}` : ""}
                    </span>
                  )}
                </td>
                <td
                  className={`px-3 py-2.5 font-medium ${
                    cancelled ? "text-mut" : kindColorClass(award.kind)
                  }`}
                >
                  {signedPoints(award.kind, award.points)}
                </td>
                <td className="px-3 py-2.5 text-mut">{award.awardedByName}</td>
                <td className={`${tableCellPadding(5, columns)} py-2.5`}>
                  {cancelled ? (
                    <Badge tone="cancelled">취소</Badge>
                  ) : (
                    <Badge tone="approved">반영</Badge>
                  )}
                </td>
                {cancelAction !== undefined && initialState !== undefined && (
                  <td className="px-5 py-2.5">
                    {!cancelled && (
                      <CancelButton
                        awardId={award.id}
                        studentProfileId={studentProfileId}
                        cancelAction={cancelAction}
                        initialState={initialState}
                      />
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </TableFrame>
    </SectionCard>
  );
}
