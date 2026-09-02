import { Legend, Tooltip } from "@/components/merit/chart-parts";
import { SectionCard } from "@/components/ui/section-card";
import { signedNet } from "@/core/authz/merit-track";
import { scaleToPercent } from "@/modules/merit/merit.chart";
import { honorificName } from "@/core/authz/roles";

export type TeacherChartRow = {
  key: string;
  name: string;
  removed: boolean;
  awardCount: number;
  share: string;
  totals: { merit: number; demerit: number; offset: number; net: number };
};

export function TeacherChart({ rows }: { rows: readonly TeacherChartRow[] }) {
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
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const positive = positives[i];
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
