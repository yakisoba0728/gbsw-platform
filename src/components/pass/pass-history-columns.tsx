import { Badge } from "@/components/ui/badge";
import { TruncatedText } from "@/components/ui/truncated-text";
import type { Column } from "@/components/ui/table";
import { isPassStatus, isPassType, PASS_TYPE_LABELS } from "@/core/authz/pass-type";
import { honorificName } from "@/core/authz/roles";
import {
  PASS_STATUS_TONES,
  passPeriod,
  passStatusLabel,
} from "@/modules/pass/pass.labels";
import { PassDetailCell, type PassDetail } from "./pass-detail-cell";

type PassHistoryRow = PassDetail & {
  type: string;
  startAt: Date;
  endAt: Date;
  decidedByName: string | null;
};

export const PASS_HISTORY_COLUMNS = {
  type: {
    key: "type",
    header: "유형",
    width: "w-[64px]",
    card: "meta",
    cardLabel: false,
    cell: (row) => (
      <span className="text-caption text-mut">
        {isPassType(row.type) ? PASS_TYPE_LABELS[row.type] : row.type}
      </span>
    ),
  },
  status: {
    key: "status",
    header: "상태",
    width: "w-[112px]",
    card: "trailing",
    cell: (row) =>
      isPassStatus(row.status) ? (
        <Badge tone={PASS_STATUS_TONES[row.status]}>
          {passStatusLabel(row)}
        </Badge>
      ) : (
        <span className="text-caption text-mut">{row.status}</span>
      ),
  },
  period: {
    key: "period",
    header: "기간",
    width: "w-[192px]",
    card: "meta",
    cardLabel: false,
    cell: (row) => (
      <span className="block text-xs tabular-nums text-mut">{passPeriod(row)}</span>
    ),
  },
  detail: {
    key: "detail",
    header: "행선지 · 사유",
    card: "title",
    cell: (row) => <PassDetailCell pass={row} />,
  },
  decided: {
    key: "decided",
    header: "결재자",
    width: "w-[112px]",
    card: "meta",
    cardLabel: "결재",
    cell: (row) => {
      const name = row.decidedByName
        ? honorificName(row.decidedByName, "ADMIN")
        : "—";
      return (
        <TruncatedText full={name} className="text-xs text-mut">
          {name}
        </TruncatedText>
      );
    },
  },
} satisfies Record<string, Column<PassHistoryRow>>;
