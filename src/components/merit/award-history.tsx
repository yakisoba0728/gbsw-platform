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

/** 취소 버튼에 그대로 넘길 두 값. 계약은 CancelButton이 정한다 — 여기서 다시
 *  적으면 둘이 갈라진 채로 둘 다 통과하는 날이 온다. */
type CancelProps = ComponentProps<typeof CancelButton>;

/**
 * 부여 내역 표. 관리자 화면(취소 가능)과 학생·학부모 화면(조회만)이 공유한다 —
 * 취소 액션과 studentProfileId(취소 후 revalidatePath 대상)만 다르게 넘긴다.
 * 열: 발생일 · 구분 · 항목 · 점수 · 부여 · 상태 (+ 취소 가능하면 작업).
 *
 * **취소 가능 여부를 불리언이 아니라 액션의 유무로 판단한다.** 예전엔
 * `canCancel: boolean`이었고 취소 버튼은 화면 경로를 직접 import했다 —
 * `components/` → `app/` 역방향 의존(저장소에 하나뿐이었다)이라 그 화면을
 * 옮기면 세 화면이 함께 깨졌다. 액션을 위에서 받으면 그 고리가 끊기고,
 * 덤으로 "취소 가능하다고 해 놓고 액션이 없는" 상태가 아예 표현되지 않는다.
 *
 * **날짜 칸은 발생일이다.** 다만 입력일이 다른 날이면 그것도 함께 적는다 —
 * "6월 12일에 일어난 일을 8월 16일에 넣었다"를 기록에서 읽을 수 없으면,
 * 나중에 날짜를 다투게 됐을 때 화면이 아무 근거도 못 준다.
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
          // 취소 버튼이 표 안 작은 글씨에서 Button size="sm"으로 커졌다.
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
                <td className="px-5 py-2.5 whitespace-nowrap text-mut">
                  {formatDate(award.occurredOn)}
                  {!isSameKstDate(award.occurredOn, award.createdAt) && (
                    <span className="block text-[11.5px] text-mut2">
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
                <td
                  className={`px-3 py-2.5 font-bold ${
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
