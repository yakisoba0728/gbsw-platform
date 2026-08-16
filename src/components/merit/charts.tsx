import { kindColorClass } from "@/components/merit/kind-badge";
import { MERIT_KIND_LABELS, type MeritKind } from "@/core/authz/merit-track";
import type { CategorySlice, MonthlyPoint } from "@/modules/merit/merit.chart";
import { scaleToPercent } from "@/modules/merit/merit.chart";

/**
 * 그래프. **서버에서 그대로 그리는 CSS 막대**다 — 차트 라이브러리를 넣지 않는다.
 *
 * 관리자가 훑어보는 막대 몇 개에 100KB짜리 클라이언트 번들을 얹을 이유가 없고,
 * 시안의 카드·테두리·색 토큰을 그대로 쓰려면 직접 그리는 편이 더 정확하다.
 * 상호작용이 없으므로 클라이언트 컴포넌트도 아니다.
 */

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-base font-extrabold text-ink">{title}</h2>
        {hint && <p className="mt-1 text-[12px] text-mut">{hint}</p>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** 데이터가 없을 때. 빈 축만 남으면 고장난 것처럼 보인다. */
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-[12.5px] text-mut">{children}</p>;
}

/**
 * 월별 추이. 상점은 위로, 벌점은 아래로 그리는 발산형 막대다 —
 * 한 축에 겹쳐 그리면 어느 달이 나빴는지 한눈에 안 들어온다.
 */
export function MonthlyChart({
  points,
  axisLabel,
}: {
  points: MonthlyPoint[];
  axisLabel: string;
}) {
  const hasData = points.some((p) => p.merit || p.demerit || p.offset);
  const meritScale = scaleToPercent(points.map((p) => p.merit + p.offset));
  const demeritScale = scaleToPercent(points.map((p) => p.demerit));

  return (
    <ChartCard title="월별 추이" hint={axisLabel}>
      {!hasData ? (
        <Empty>아직 부여된 상벌점이 없습니다. 부여하면 여기에 그려집니다.</Empty>
      ) : (
        <div className="flex items-stretch gap-1 overflow-x-auto">
          {points.map((point, i) => (
            <div key={point.key} className="flex min-w-[28px] flex-1 flex-col gap-1">
              {/* 위: 상점 + 상쇄 */}
              <div className="flex h-16 items-end">
                <div
                  className="w-full rounded-t-[3px] bg-blue"
                  style={{ height: `${meritScale[i]}%` }}
                  title={`${point.label} 상점 ${point.merit}${point.offset ? ` · 상쇄 ${point.offset}` : ""}`}
                />
              </div>
              <div className="h-px bg-line2" />
              {/* 아래: 벌점 */}
              <div className="flex h-16 items-start">
                <div
                  className="w-full rounded-b-[3px] bg-rose"
                  style={{ height: `${demeritScale[i]}%` }}
                  title={`${point.label} 벌점 ${point.demerit}`}
                />
              </div>
              <span className="text-center text-[10px] text-mut">{point.label}</span>
            </div>
          ))}
        </div>
      )}
      <Legend
        items={[
          { color: "bg-blue", label: "상점(+상쇄)" },
          { color: "bg-rose", label: "벌점" },
        ]}
      />
    </ChartCard>
  );
}

/** 반별 순점수. 0을 가운데 두고 좌우로 뻗는다 — 순점수는 음수가 될 수 있다. */
export function ClassNetChart({
  rows,
}: {
  rows: { grade: number; classNo: number; net: number }[];
}) {
  if (rows.length === 0) {
    return (
      <ChartCard title="반별 순점수">
        <Empty>배정된 반이 없습니다.</Empty>
      </ChartCard>
    );
  }

  const scale = scaleToPercent(rows.map((r) => r.net));

  return (
    <ChartCard title="반별 순점수" hint="0을 기준으로 좌우로 뻗습니다">
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={`${row.grade}-${row.classNo}`} className="flex items-center gap-2">
            <span className="w-[76px] shrink-0 text-[12px] font-semibold text-ink">
              {row.grade}-{row.classNo}
            </span>
            {/* 왼쪽 절반: 음수 */}
            <div className="flex flex-1 justify-end">
              <div
                className="h-4 rounded-l-[3px] bg-rose"
                style={{ width: row.net < 0 ? `${scale[i]}%` : 0 }}
              />
            </div>
            <div className="h-5 w-px bg-line" />
            {/* 오른쪽 절반: 양수 */}
            <div className="flex flex-1">
              <div
                className="h-4 rounded-r-[3px] bg-green"
                style={{ width: row.net >= 0 ? `${scale[i]}%` : 0 }}
              />
            </div>
            <span
              className={`w-[52px] shrink-0 text-right text-[12px] font-bold ${
                row.net >= 0 ? "text-green" : "text-rose"
              }`}
            >
              {row.net >= 0 ? "+" : ""}
              {row.net}
            </span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

/** 분류별 분포. 무엇 때문에 점수가 오갔는지 보여준다. */
export function CategoryChart({ slices }: { slices: CategorySlice[] }) {
  if (slices.length === 0) {
    return (
      <ChartCard title="분류별 분포">
        <Empty>아직 부여된 상벌점이 없습니다.</Empty>
      </ChartCard>
    );
  }

  const top = slices.slice(0, 12);
  const scale = scaleToPercent(top.map((s) => s.count));

  return (
    <ChartCard title="분류별 분포" hint="건수 기준 상위 12개">
      <div className="flex flex-col gap-2">
        {top.map((slice, i) => (
          <div key={`${slice.kind}-${slice.category}`} className="flex items-center gap-2.5">
            <span className="w-[132px] shrink-0 truncate text-[12px] text-ink">
              {slice.category}
            </span>
            <span className={`w-[44px] shrink-0 text-[11px] font-bold ${kindColorClass(slice.kind)}`}>
              {MERIT_KIND_LABELS[slice.kind as MeritKind] ?? slice.kind}
            </span>
            <div className="h-4 flex-1 rounded-[3px] bg-soft">
              <div
                className={`h-4 rounded-[3px] ${barColor(slice.kind)}`}
                style={{ width: `${scale[i]}%` }}
              />
            </div>
            <span className="w-[64px] shrink-0 text-right text-[12px] text-mut">
              {slice.count}건 · {slice.points}점
            </span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

function barColor(kind: string): string {
  if (kind === "MERIT") return "bg-blue";
  if (kind === "DEMERIT") return "bg-rose";
  if (kind === "OFFSET") return "bg-green";
  return "bg-mut";
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line2 pt-3">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-mut">
          <span className={`size-2.5 rounded-[2px] ${item.color}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
