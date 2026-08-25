import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { CancelButton } from "@/components/merit/cancel-button";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { formatDate, isSameKstDate } from "@/lib/datetime";
import type { StudentMeritView } from "@/modules/merit/award.service";
import { honorificName } from "@/core/authz/roles";

type AwardRow = StudentMeritView["awards"][number];

/** 취소 버튼에 그대로 넘길 두 값. 계약은 CancelButton이 정한다. */
type CancelProps = ComponentProps<typeof CancelButton>;

/**
 * 부여 내역. 교사 화면(취소 가능)과 학생·학부모 화면(조회만)이 공유하며,
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

  const columns: Column<AwardRow>[] = [
    {
      key: "occurredOn",
      header: "발생일",
      width: "w-[112px]",
      // 카드에서는 라벨이 없다 — 날짜 모양 자체가 무슨 값인지 말한다.
      card: "meta",
      cardLabel: false,
      cell: (award) => (
        <span className="font-mono whitespace-nowrap text-mut">
          {formatDate(award.occurredOn)}
          {!isSameKstDate(award.occurredOn, award.createdAt) && (
            <span className="block text-xs text-mut2">
              입력 {formatDate(award.createdAt)}
            </span>
          )}
        </span>
      ),
    },
    {
      // 카드에서는 빠진다 — 점수의 부호와 색이 이미 상점·벌점을 말한다.
      key: "kind",
      header: "구분",
      width: "w-[68px]",
      cell: (award) => <KindBadge kind={award.kind} />,
    },
    {
      key: "label",
      header: "항목",
      card: "title",
      cell: (award) => {
        const cancelled = award.status === "CANCELLED";
        return (
          <>
            <span
              className={cancelled ? "text-mut line-through" : "font-medium text-ink"}
            >
              {award.label}
            </span>
            {award.note && <span className="block text-xs text-mut">{award.note}</span>}
            {/* "교사면 누구나 취소할 수 있다"의 근거가 이 흔적이다 — 화면에 낸다. */}
            {cancelled && (
              <span className="block text-xs text-rose">
                취소
                {award.cancelledByName
                  ? ` · ${honorificName(award.cancelledByName, "ADMIN")}`
                  : ""}
                {award.cancelledAt ? ` · ${formatDate(award.cancelledAt)}` : ""}
                {award.cancelReason ? ` · ${award.cancelReason}` : ""}
              </span>
            )}
          </>
        );
      },
    },
    {
      key: "points",
      header: "점수",
      width: "w-[64px]",
      card: "trailing",
      cell: (award) => (
        <span
          className={`font-medium ${
            award.status === "CANCELLED" ? "text-mut" : kindColorClass(award.kind)
          }`}
        >
          {signedPoints(award.kind, award.points)}
        </span>
      ),
    },
    {
      key: "awardedBy",
      header: "부여",
      width: "w-[120px]",
      card: "meta",
      // 부여·취소는 교사 전용이라(can.ts) 이름 스냅샷에 역할이 없어도 호칭이 정해진다.
      cell: (award) => (
        <span className="text-mut">{honorificName(award.awardedByName, "ADMIN")}</span>
      ),
    },
    {
      // 카드에서는 빠진다 — 취소선과 항목 아래 취소 줄이 같은 사실을 이미 적는다.
      key: "status",
      header: "상태",
      width: canCancel ? "w-[76px]" : "w-[92px]",
      cell: (award) =>
        award.status === "CANCELLED" ? (
          <Badge tone="cancelled">취소</Badge>
        ) : (
          <Badge tone="approved">반영</Badge>
        ),
    },
  ];

  if (cancelAction !== undefined && initialState !== undefined) {
    columns.push({
      key: "actions",
      header: "작업",
      width: "w-[104px]",
      card: "actions",
      cell: (award) =>
        award.status === "CANCELLED" ? null : (
          <CancelButton
            awardId={award.id}
            studentProfileId={studentProfileId}
            cancelAction={cancelAction}
            initialState={initialState}
          />
        ),
    });
  }

  return (
    <SectionCard title="부여 내역" headingLevel={3} flush>
      {/* 비어도 카드 제목을 남긴다 — 제목까지 사라지면 무엇이 없는 것인지 모른다. */}
      {awards.length === 0 ? (
        <EmptyState variant="inside">내역이 없습니다.</EmptyState>
      ) : (
        <DataTable
          minWidth={canCancel ? 604 : 560}
          narrow="cards"
          rows={awards}
          rowKey={(award) => award.id}
          columns={columns}
        />
      )}
    </SectionCard>
  );
}
