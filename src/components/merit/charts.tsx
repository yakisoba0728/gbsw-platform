import { Legend, Tooltip } from "@/components/merit/chart-parts";
import Link from "next/link";
import { DemeritFlag } from "@/components/merit/demerit-level";
import { kindBarClass, kindColorClass } from "@/components/merit/kind-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  MERIT_KIND_LABELS,
  type MeritKind,
} from "@/core/authz/merit-track";
import type { CategorySlice, MonthlyPoint } from "@/modules/merit/merit.chart";
import { scaleToPercent } from "@/modules/merit/merit.chart";
import {
  signedNet,
  type DemeritThresholds,
} from "@/modules/merit/merit.points";
import { honorificName } from "@/core/authz/roles";

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
    <SectionCard title={title} hint={hint} headingLevel={3}>
      {children}
    </SectionCard>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <EmptyState variant="inside">{children}</EmptyState>;
}

export function MonthlyChart({
  points,
  axisLabel,
}: {
  points: MonthlyPoint[];
  axisLabel: string;
}) {
  const hasData = points.some((p) => p.merit || p.demerit || p.offset);
  const scale = scaleToPercent([
    ...points.map((p) => p.merit + p.offset),
    ...points.map((p) => p.demerit),
  ]);
  const meritScale = scale.slice(0, points.length);
  const demeritScale = scale.slice(points.length);

  return (
    <ChartCard title="월별 추이" hint={axisLabel}>
      {!hasData ? (
        <Empty>부여된 상벌점이 없습니다.</Empty>
      ) : (
        <div className="@container">
          <div className="flex items-stretch gap-1 overflow-x-auto pt-4 @md:overflow-x-visible @md:pt-10">
          {points.map((point, i) => {
            const empty = !point.merit && !point.demerit && !point.offset;
            return (
              <div
                key={point.key}
                tabIndex={0}
                role="group"
                aria-label={`${point.label} 순점수 ${empty ? "없음" : signedNet(point.net)}`}
                className="group relative flex min-w-[30px] flex-1 flex-col gap-1 rounded-btn outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <Tooltip
                  title={point.label}
                  rows={[
                    { label: "상점", value: String(point.merit), className: "text-blue" },
                    ...(point.offset
                      ? [
                          {
                            label: "상쇄점",
                            value: String(point.offset),
                            className: "text-green",
                          },
                        ]
                      : []),
                    { label: "벌점", value: String(point.demerit), className: "text-rose" },
                    {
                      label: "순점수",
                      value: signedNet(point.net),
                      className: point.net >= 0 ? "text-green" : "text-rose",
                    },
                  ]}
                />

                <div className="flex h-16 items-end justify-center">
                  <div
                    className="w-full max-w-9 rounded-t-[3px] bg-blue transition-opacity group-hover:opacity-80"
                    style={{ height: `${meritScale[i]}%` }}
                  />
                </div>
                <div className="h-px bg-line" />
                <div className="flex h-16 items-start justify-center">
                  <div
                    className="w-full max-w-9 rounded-b-[3px] bg-rose transition-opacity group-hover:opacity-80"
                    style={{ height: `${demeritScale[i]}%` }}
                  />
                </div>

                <span className="text-center text-xs text-mut">{point.label}</span>
                <span
                  className={`text-center text-xs font-medium ${
                    empty ? "text-mut2" : point.net >= 0 ? "text-green" : "text-rose"
                  }`}
                >
                  {empty ? "—" : signedNet(point.net)}
                </span>
              </div>
            );
          })}
          </div>
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

export function ClassNetChart({
  rows,
  hrefFor,
}: {
  rows: {
    grade: number;
    classNo: number;
    students: number;
    merit: number;
    demerit: number;
    offset: number;
    net: number;
    avgNet: number;
  }[];
  hrefFor?: (row: { grade: number; classNo: number }) => string;
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
    <ChartCard
      title="반별 순점수"
      hint={hrefFor ? "누르면 그 반만" : undefined}
    >
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const body = (
            <>
              <Tooltip
                title={`${row.grade}학년 ${row.classNo}반 · ${row.students}명`}
                rows={[
                  { label: "상점", value: String(row.merit), className: "text-blue" },
                  ...(row.offset
                    ? [{ label: "상쇄점", value: String(row.offset), className: "text-green" }]
                    : []),
                  { label: "벌점", value: String(row.demerit), className: "text-rose" },
                  {
                    label: "순점수",
                    value: signedNet(row.net),
                    className: row.net >= 0 ? "text-green" : "text-rose",
                  },
                  { label: "1인 평균", value: signedNet(row.avgNet) },
                ]}
              />
              <span className="w-[76px] shrink-0 text-xs font-medium text-ink">
                {row.grade}-{row.classNo}
              </span>
              <span className="flex flex-1 justify-end">
                <span
                  className="h-4 rounded-l-btn bg-rose"
                  style={{ width: row.net < 0 ? `${scale[i]}%` : 0 }}
                />
              </span>
              <span className="h-5 w-px bg-line" />
              <span className="flex flex-1">
                <span
                  className="h-4 rounded-r-btn bg-green"
                  style={{ width: row.net >= 0 ? `${scale[i]}%` : 0 }}
                />
              </span>
              <span
                className={`w-[52px] shrink-0 text-right text-xs font-medium ${
                  row.net >= 0 ? "text-green" : "text-rose"
                }`}
              >
                {signedNet(row.net)}
              </span>
            </>
          );

          const shared =
            "group relative flex items-center gap-2 rounded-btn px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ink";

          return hrefFor ? (
            <Link
              key={`${row.grade}-${row.classNo}`}
              href={hrefFor(row)}
              className={`${shared} hover:bg-soft`}
            >
              {body}
            </Link>
          ) : (
            <div
              key={`${row.grade}-${row.classNo}`}
              tabIndex={0}
              role="group"
              aria-label={`${row.grade}학년 ${row.classNo}반 순점수 ${signedNet(row.net)}`}
              className={shared}
            >
              {body}
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

export function StudentNetChart({
  rows,
  thresholds,
  hrefFor,
}: {
  rows: {
    studentProfileId: string;
    name: string;
    number: number | null;
    merit: number;
    demerit: number;
    offset: number;
    net: number;
  }[];
  thresholds: DemeritThresholds;
  hrefFor: (studentProfileId: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <ChartCard title="학생별 순점수">
        <Empty>이 반에 학생이 없습니다.</Empty>
      </ChartCard>
    );
  }

  const sorted = [...rows].sort((a, b) => a.net - b.net);
  const scale = scaleToPercent(sorted.map((r) => r.net));

  return (
    <ChartCard title="학생별 순점수" hint="순점수 낮은 순">
      <div className="flex flex-col gap-2">
        {sorted.map((row, i) => (
            <Link
              key={row.studentProfileId}
              href={hrefFor(row.studentProfileId)}
              className="group relative flex items-center gap-2 rounded-btn px-1 py-0.5 outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-ink"
            >
              <Tooltip
                title={`${row.number ?? "—"}번 ${honorificName(row.name, "STUDENT")}`}
                rows={[
                  { label: "상점", value: String(row.merit), className: "text-blue" },
                  ...(row.offset
                    ? [{ label: "상쇄점", value: String(row.offset), className: "text-green" }]
                    : []),
                  { label: "벌점", value: String(row.demerit), className: "text-rose" },
                  {
                    label: "순점수",
                    value: signedNet(row.net),
                    className: row.net >= 0 ? "text-green" : "text-rose",
                  },
                ]}
              />
              <span className="w-[92px] shrink-0 truncate text-xs font-medium text-ink">
                {row.name}
                <DemeritFlag thresholds={thresholds} demerit={row.demerit} />
              </span>
              <span className="flex flex-1 justify-end">
                <span
                  className="h-4 rounded-l-btn bg-rose"
                  style={{ width: row.net < 0 ? `${scale[i]}%` : 0 }}
                />
              </span>
              <span className="h-5 w-px bg-line" />
              <span className="flex flex-1">
                <span
                  className="h-4 rounded-r-btn bg-green"
                  style={{ width: row.net >= 0 ? `${scale[i]}%` : 0 }}
                />
              </span>
              <span
                className={`w-[52px] shrink-0 text-right text-xs font-medium ${
                  row.net >= 0 ? "text-green" : "text-rose"
                }`}
              >
                {signedNet(row.net)}
              </span>
            </Link>
          ))}
      </div>
    </ChartCard>
  );
}

export function CategoryChart({
  slices,
  scopeLabel,
}: {
  slices: CategorySlice[];
  scopeLabel: string;
}) {
  if (slices.length === 0) {
    return (
      <ChartCard title="분류별 분포" hint={`${scopeLabel} · 건수 기준`}>
        <Empty>부여된 상벌점이 없습니다.</Empty>
      </ChartCard>
    );
  }

  const top = slices.slice(0, 12);
  const scale = scaleToPercent(top.map((s) => s.count));
  const hidden = slices.length - top.length;

  return (
    <ChartCard
      title="분류별 분포"
      hint={
        hidden > 0
          ? `${scopeLabel} · 건수 기준 상위 12개 (${hidden}개 더 있음)`
          : `${scopeLabel} · 건수 기준`
      }
    >
      <div className="flex flex-col gap-2">
        {top.map((slice, i) => (
          <div
            key={`${slice.kind}-${slice.category}`}
            tabIndex={0}
            role="group"
            aria-label={`${slice.category} ${
              MERIT_KIND_LABELS[slice.kind as MeritKind] ?? slice.kind
            } ${slice.count}건 ${slice.points}점`}
            className="group relative flex items-center gap-2.5 rounded-btn px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <Tooltip
              title={slice.category}
              rows={[
                {
                  label: "구분",
                  value: MERIT_KIND_LABELS[slice.kind as MeritKind] ?? slice.kind,
                  className: kindColorClass(slice.kind),
                },
                { label: "건수", value: `${slice.count}건` },
                { label: "합계", value: `${slice.points}점` },
              ]}
            />
            <span className="w-[132px] shrink-0 truncate text-xs text-ink">
              {slice.category}
            </span>
            <span
              className={`w-[44px] shrink-0 text-xs font-medium ${kindColorClass(slice.kind)}`}
            >
              {MERIT_KIND_LABELS[slice.kind as MeritKind] ?? slice.kind}
            </span>
            <span className="h-4 flex-1 rounded-btn bg-soft">
              <span
                className={`block h-4 rounded-btn ${kindBarClass(slice.kind)} transition-opacity group-hover:opacity-80`}
                style={{ width: `${scale[i]}%` }}
              />
            </span>
            <span className="w-[64px] shrink-0 text-right text-xs text-mut">
              {slice.count}건 · {slice.points}점
            </span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
