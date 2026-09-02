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

type CancelProps = ComponentProps<typeof CancelButton>;

export function AwardHistory({
  awards,
  studentProfileId,
  cancelAction,
  initialState,
}: {
  awards: AwardRow[];
  studentProfileId: string;
  cancelAction?: CancelProps["cancelAction"];
  initialState?: CancelProps["initialState"];
}) {
  const canCancel = cancelAction !== undefined && initialState !== undefined;

  const columns: Column<AwardRow>[] = [
    {
      key: "occurredOn",
      header: "발생일",
      width: "w-[112px]",
      card: "meta",
      cardLabel: false,
      cell: (award) => (
        <span className="whitespace-nowrap tabular-nums text-mut">
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
      cell: (award) => (
        <span className="text-mut">{honorificName(award.awardedByName, "ADMIN")}</span>
      ),
    },
    {
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
