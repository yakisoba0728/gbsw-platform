import { ChevronDownIcon } from "@/components/icons";
import {
  KindBadge,
  kindBarClass,
  kindColorClass,
  signedPoints,
} from "@/components/merit/kind-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/truncated-text";
import {
  MERIT_KINDS,
  MERIT_KIND_LABELS,
  type MeritKind,
} from "@/core/authz/merit-track";
import { scaleToPercent } from "@/modules/merit/merit.chart";
import type { RuleStatRow, RuleStats } from "@/modules/merit/stats.service";

/** 분류 없는 규정이 모이는 자리. `categoryDistribution`과 같은 말을 쓴다. */
const NO_CATEGORY = "분류 없음";

type Group = {
  category: string;
  rows: RuleStatRow[];
  count: number;
  kinds: { kind: string; count: number }[];
};

/** 분류별 부여. 114개를 평평하게 늘어놓으면 읽히지 않아 분류로 접는다. */
export function RuleCategoryCard({ stats }: { stats: RuleStats }) {
  const groups = groupByCategory(stats.rows);
  const deleted = stats.rows.filter((row) => row.deleted).length;

  // 막대 길이의 기준은 화면 전체에서 가장 많이 나온 항목 하나다 — 분류마다
  // 기준이 다르면 열어 둔 분류끼리 막대 길이를 견줄 수 없다.
  const scale = scaleToPercent(stats.rows.map((row) => row.count));
  const barWidth = new Map(stats.rows.map((row, i) => [row.ruleId, scale[i]]));

  return (
    // 폭 판단은 카드 자신의 폭으로 한다 — 뷰포트는 사이드바 유무를 모른다.
    <SectionCard
      flush
      headingLevel={3}
      className="@container"
      title="분류별 부여"
      hint={`${groups.length}개 분류 · ${stats.rows.length}개 항목 · ${stats.totalCount}건`}
      controls={
        <>
          <Legend />
          {deleted > 0 && (
            <p className="mt-2 text-xs text-mut">
              삭제된 규정도 부여 기록이 있으면 나옵니다.
            </p>
          )}
        </>
      }
    >
      {groups.length === 0 ? (
        <EmptyState variant="inside">부여된 상벌점이 없습니다.</EmptyState>
      ) : (
        groups.map((group, index) => (
          <details
            key={group.category}
            // 가장 큰 분류만 펼쳐 둔다 — 전부 접혀 있으면 안에 표가 있다는 걸 모른다.
            open={index === 0}
            // 마지막 줄의 hover 바탕은 둥글린다 — 사각으로 칠하면 카드의 아래 모서리를 덮는다.
            className="group border-b border-line2 last:border-0 last:[&>summary]:rounded-b-card"
          >
            <summary className="flex cursor-pointer list-none flex-col gap-2 px-5 py-3 outline-none select-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-ink [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2">
                <ChevronDownIcon
                  size={16}
                  className="shrink-0 text-mut transition-transform group-open:rotate-180"
                />
                <TruncatedText
                  full={group.category}
                  // summary가 이미 초점을 받는다 — 안에 하나 더 두면 탭이 같은 줄에
                  // 두 번 멈춘다.
                  focusable={false}
                  outerClassName="flex-1"
                  className="text-sm font-medium text-ink"
                >
                  {group.category}
                </TruncatedText>
                <span className="hidden shrink-0 text-xs text-mut @sm:inline">
                  항목 {group.rows.length}개
                </span>
                <span className="shrink-0 text-xs text-mut">{group.count}건</span>
                <span className="w-12 shrink-0 text-right text-xs font-medium text-ink">
                  {sharePercent(group.count, stats.totalCount)}
                </span>
              </div>

              {/* 상자 전체가 100%다 — 분류가 전교 부여의 얼마를 차지하는지 그대로 읽힌다. */}
              <span
                className="flex h-1.5 w-full overflow-hidden rounded-full bg-mut-soft"
                aria-hidden
              >
                <span
                  className="flex h-full"
                  style={{ width: percent(group.count, stats.totalCount) }}
                >
                  {group.kinds.map((slice) => (
                    <span
                      key={slice.kind}
                      className={kindBarClass(slice.kind)}
                      style={{ width: percent(slice.count, group.count) }}
                    />
                  ))}
                </span>
              </span>
            </summary>

            <RuleTable
              rows={group.rows}
              total={stats.totalCount}
              barWidth={barWidth}
            />
          </details>
        ))
      )}
    </SectionCard>
  );
}

function RuleTable({
  rows,
  total,
  barWidth,
}: {
  rows: RuleStatRow[];
  total: number;
  barWidth: Map<string, number>;
}) {
  const columns: Column<RuleStatRow>[] = [
    {
      key: "kind",
      header: "구분",
      width: "w-[68px]",
      card: "meta",
      cardLabel: false,
      cell: (row) => <KindBadge kind={row.kind} />,
    },
    {
      key: "label",
      header: "항목",
      card: "title",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink">{row.label}</span>
          {/* 규정 관리에는 없는 항목이 여기 있는 이유를 줄 자체가 밝힌다. */}
          {row.deleted && <Badge tone="cancelled">삭제됨</Badge>}
        </span>
      ),
    },
    {
      key: "count",
      header: "건수",
      width: "w-[76px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-ink">{row.count}</span>,
    },
    {
      key: "share",
      header: "비중",
      width: "w-[164px]",
      card: "meta",
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span
            className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-mut-soft"
            aria-hidden
          >
            <span
              className={`block h-full rounded-full ${kindBarClass(row.kind)}`}
              style={{ width: `${barWidth.get(row.ruleId) ?? 0}%` }}
            />
          </span>
          <span className="text-xs text-mut">{sharePercent(row.count, total)}</span>
        </span>
      ),
    },
    {
      key: "points",
      header: "합계 점수",
      width: "w-[96px]",
      card: "trailing",
      cell: (row) => (
        <span className={`font-medium ${kindColorClass(row.kind)}`}>
          {signedPoints(row.kind, row.points)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      minWidth={560}
      narrow="cards"
      rows={rows}
      rowKey={(row) => row.ruleId}
      columns={columns}
    />
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      {MERIT_KINDS.map((kind: MeritKind) => (
        <span key={kind} className="flex items-center gap-1.5 text-xs text-mut">
          <span className={`size-2.5 rounded-full ${kindBarClass(kind)}`} />
          {MERIT_KIND_LABELS[kind]}
        </span>
      ))}
    </div>
  );
}

function groupByCategory(rows: readonly RuleStatRow[]): Group[] {
  const map = new Map<string, RuleStatRow[]>();
  for (const row of rows) {
    const category = row.category?.trim() || NO_CATEGORY;
    const list = map.get(category);
    if (list) list.push(row);
    else map.set(category, [row]);
  }

  return [...map]
    .map(([category, list]) => ({
      category,
      rows: list,
      count: list.reduce((sum, row) => sum + row.count, 0),
      kinds: kindMix(list),
    }))
    .sort(
      (a, b) =>
        // 분류 없음은 맨 뒤. 그 앞은 건수 많은 순이다.
        Number(a.category === NO_CATEGORY) - Number(b.category === NO_CATEGORY) ||
        b.count - a.count ||
        a.category.localeCompare(b.category, "ko"),
    );
}

/** 분류 막대를 종류별로 나눈다. 같은 분류에 상점과 벌점이 함께 있을 수 있다. */
function kindMix(rows: RuleStatRow[]): { kind: string; count: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.kind, (map.get(row.kind) ?? 0) + row.count);
  }

  const order = (kind: string) => {
    const index = (MERIT_KINDS as readonly string[]).indexOf(kind);
    return index === -1 ? MERIT_KINDS.length : index;
  };

  return [...map]
    .map(([kind, count]) => ({ kind, count }))
    .filter((slice) => slice.count > 0)
    .sort((a, b) => order(a.kind) - order(b.kind));
}

function percent(value: number, total: number): string {
  return total <= 0 ? "0%" : `${(value / total) * 100}%`;
}

/** 전체 부여 건수 대비 비중. 10% 미만은 소수 첫째 자리까지 적는다. */
function sharePercent(count: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = (count / total) * 100;
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
}
