import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { signedNet } from "@/core/authz/merit-track";
import { scaleToPercent } from "@/modules/merit/merit.chart";
import { honorificName } from "@/core/authz/roles";
import { ChartDataSummary } from "./chart-data-summary";

/**
 * 서버에서 그리는 CSS 막대. 이 화면에만 쓰므로 여기 둔다 —
 * 말풍선·범례는 components/merit/charts.tsx와 같은 규격이다.
 */

/** 한 줄. 비중 문자열은 화면이 미리 붙여서 넘긴다. */
export type TeacherChartRow = {
  key: string;
  name: string;
  removed: boolean;
  awardCount: number;
  /** `32%` — 전체 부여 건수 대비. */
  share: string;
  totals: { merit: number; demerit: number; offset: number; net: number };
};

/** 막대 위 말풍선. hover와 focus 둘 다에 반응한다 — 키보드로도 값을 읽는다. */
function Tooltip({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; className?: string }[];
}) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-btn border border-line bg-surface px-3 py-2 whitespace-nowrap shadow-float group-hover:block group-focus-within:block"
    >
      <span className="block text-xs font-medium text-ink">{title}</span>
      {rows.map((row) => (
        <span key={row.label} className="mt-0.5 flex items-center gap-2 text-xs">
          <span className="text-mut">{row.label}</span>
          <span className={`ml-auto font-medium ${row.className ?? "text-ink"}`}>
            {row.value}
          </span>
        </span>
      ))}
    </span>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line2 pt-3">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-xs text-mut">
          <span className={`size-2.5 rounded-full ${item.color}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/**
 * 부여자별 상점·벌점. 0을 가운데 두고 벌점은 왼쪽, 상점·상쇄점은 오른쪽으로 뻗는다 —
 * 한쪽으로만 긴 줄이 그 사람의 기준이 한쪽에 쏠려 있다는 뜻이다.
 */
export function TeacherChart({ rows }: { rows: readonly TeacherChartRow[] }) {
  // 좌우를 같은 자로 재야 사람끼리 비교가 된다 — 척도를 한 번에 잡는다.
  const positives = rows.map((row) => row.totals.merit + row.totals.offset);
  const scale = scaleToPercent([...positives, ...rows.map((row) => row.totals.demerit)]);
  const positiveScale = scale.slice(0, rows.length);
  const demeritScale = scale.slice(rows.length);

  return (
    <SectionCard
      title="부여자별 상점·벌점"
      hint="건수 많은 순 · 막대는 점수 합계"
      headingLevel={3}
    >
      {rows.length === 0 ? (
        <EmptyState variant="inside">부여된 상벌점이 없습니다.</EmptyState>
      ) : (
        <>
          <ChartDataSummary
            label="부여자별 상점·벌점"
            rows={rows.map(
              (row) =>
                `${honorificName(row.name, "ADMIN")}${row.removed ? " (삭제된 계정)" : ""}: ${row.awardCount}건, 상점 ${row.totals.merit}점, 벌점 ${row.totals.demerit}점, 상쇄점 ${row.totals.offset}점, 순점수 ${signedNet(row.totals.net)}, 전체의 ${row.share}`,
            )}
          />

          <div className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const positive = positives[i];
              // 상점과 상쇄점은 오른쪽 한 막대를 나눠 쓴다 — 합이 곧 막대 길이다.
              const meritWidth =
                positive === 0 ? 0 : (positiveScale[i] * row.totals.merit) / positive;
              const offsetWidth = positiveScale[i] - meritWidth;

              return (
                <div
                  key={row.key}
                  tabIndex={0}
                  role="group"
                  aria-label={`${honorificName(row.name, "ADMIN")}${
                    row.removed ? " 삭제된 계정" : ""
                  } 상점 ${
                    row.totals.merit
                  } 벌점 ${row.totals.demerit} ${row.awardCount}건 전체의 ${row.share}`}
                  className="group relative flex items-center gap-2 rounded-btn px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <Tooltip
                    title={`${honorificName(row.name, "ADMIN")}${row.removed ? " · 삭제된 계정" : ""}`}
                    rows={[
                      { label: "상점", value: String(row.totals.merit), className: "text-blue" },
                      ...(row.totals.offset
                        ? [
                            {
                              label: "상쇄점",
                              value: String(row.totals.offset),
                              className: "text-green",
                            },
                          ]
                        : []),
                      { label: "벌점", value: String(row.totals.demerit), className: "text-rose" },
                      {
                        label: "순점수",
                        value: signedNet(row.totals.net),
                        className: row.totals.net >= 0 ? "text-green" : "text-rose",
                      },
                      { label: "전체 대비", value: row.share },
                    ]}
                  />
                  {/* 축 라벨만 맨이름이다 — 폭이 76px로 고정이라 호칭을 붙이면
                      이름이 잘린다. 말풍선과 aria-label은 호칭을 붙여 읽어 준다.
                      그래서 TruncatedText도 달지 않는다: 이 줄을 덮는 Tooltip이
                      이미 전문을 띄워 말풍선이 둘 뜨게 된다. */}
                  <span className="w-[76px] shrink-0 truncate text-xs font-medium text-ink">
                    {row.name}
                  </span>
                  <span className="flex flex-1 justify-end">
                    <span
                      className="h-4 rounded-l-btn bg-rose"
                      style={{ width: `${demeritScale[i]}%` }}
                    />
                  </span>
                  <span className="h-5 w-px bg-line" />
                  <span className="flex flex-1">
                    <span
                      className={`h-4 bg-blue ${offsetWidth > 0 ? "rounded-l-btn" : "rounded-btn"}`}
                      style={{ width: `${meritWidth}%` }}
                    />
                    {offsetWidth > 0 && (
                      <span
                        className="h-4 rounded-r-btn bg-green"
                        style={{ width: `${offsetWidth}%` }}
                      />
                    )}
                  </span>
                  <span className="w-[60px] shrink-0 text-right text-xs font-medium text-ink">
                    {row.awardCount}건
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Legend
        items={[
          { color: "bg-rose", label: "벌점" },
          { color: "bg-blue", label: "상점" },
          { color: "bg-green", label: "상쇄점" },
        ]}
      />
    </SectionCard>
  );
}
