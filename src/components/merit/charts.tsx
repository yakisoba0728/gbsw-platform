import Link from "next/link";
import { DemeritFlag } from "@/components/merit/demerit-level";
import { kindBarClass, kindColorClass } from "@/components/merit/kind-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import {
  MERIT_KIND_LABELS,
  signedNet,
  type DemeritThresholds,
  type MeritKind,
} from "@/core/authz/merit-track";
import type { CategorySlice, MonthlyPoint } from "@/modules/merit/merit.chart";
import { scaleToPercent } from "@/modules/merit/merit.chart";

/**
 * 서버에서 그리는 CSS 막대. 차트 라이브러리를 쓰지 않는다.
 * 터치 기기에는 hover가 없으므로 막대 아래에 숫자를 함께 적는다.
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
    // 통계 화면은 페이지 <h2> 아래에 카드를 늘어놓는다 — 카드 제목은 h3다.
    <SectionCard title={title} hint={hint} headingLevel={3}>
      {children}
    </SectionCard>
  );
}

/** 데이터가 없을 때. 빈 축만 남으면 고장난 것처럼 보인다. */
function Empty({ children }: { children: React.ReactNode }) {
  return <EmptyState variant="inside">{children}</EmptyState>;
}

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

/** 월별 추이. 상점은 위로, 벌점은 아래로 그리는 발산형 막대다. */
export function MonthlyChart({
  points,
  axisLabel,
}: {
  points: MonthlyPoint[];
  axisLabel: string;
}) {
  const hasData = points.some((p) => p.merit || p.demerit || p.offset);
  // 위아래를 같은 자로 재야 막대 길이를 견줄 수 있다 — 계열마다 척도를 따로 잡으면
  // 상점 10과 벌점 10이 다른 길이로 서서, 벌점만 많은 달이 상점도 많은 달로 보인다.
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
        // 위 여백은 말풍선 자리다. 터치 기기에는 hover가 없어 좁은 폭에서는 빈 칸이다.
        <div className="@container">
          {/*
            @md부터 overflow를 푼다. `overflow-x: auto`는 계산값 `overflow-y`까지
            `auto`로 만들어(둘 중 하나가 visible이 아니면 나머지도 아니게 된다)
            막대 위로 뜨는 말풍선(`bottom-full`)이 이 상자를 못 벗어난다 — 1440에서
            말풍선 88px 중 38px이 잘려 나갔다.

            @md(448px)면 막대 12개(30px)와 간격 11개(4px)를 더해 404px이라 언제나
            들어가므로, 스크롤 상자를 만들 이유가 없다. 그보다 좁을 때만 스크롤한다
            (그 폭에는 hover가 없고 순점수는 막대 아래에 늘 적혀 있다).
          */}
          <div className="flex items-stretch gap-1 overflow-x-auto pt-4 @md:overflow-x-visible @md:pt-14">
          {points.map((point, i) => {
            const empty = !point.merit && !point.demerit && !point.offset;
            return (
              <div
                key={point.key}
                tabIndex={0}
                // role 없이 tabIndex만 주면 스크린리더가 무슨 달의 무슨 값인지 못 읽는다.
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

                {/* 위: 상점 + 상쇄 */}
                <div className="flex h-16 items-end">
                  <div
                    className="w-full rounded-t-btn bg-blue transition-opacity group-hover:opacity-80"
                    style={{ height: `${meritScale[i]}%` }}
                  />
                </div>
                <div className="h-px bg-line2" />
                {/* 아래: 벌점 */}
                <div className="flex h-16 items-start">
                  <div
                    className="w-full rounded-b-btn bg-rose transition-opacity group-hover:opacity-80"
                    style={{ height: `${demeritScale[i]}%` }}
                  />
                </div>

                <span className="text-center text-xs text-mut">{point.label}</span>
                {/* 터치 기기에는 hover가 없다 — 순점수는 늘 보이게 한다. */}
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

/** 반별 순점수. 0을 가운데 두고 좌우로 뻗는다 — 순점수는 음수가 될 수 있다. */
/**
 * 반별 순점수. **벌점 기준 표시가 없다** — 기준은 학생 한 명에게 정한 값이라
 * 반 합계에 대면 인원이 많은 반은 예외 없이 넘는다. 위험한 학생은 이름으로
 * 짚는 「기준 초과 학생」이 맡는다.
 */
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
  /** 주면 각 반이 링크가 된다 — 눌러서 그 반만 볼 수 있게. */
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
            // 링크가 아닐 때도 키보드로 훑어야 말풍선(focus-within)이 뜬다.
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

/** 학생별 순점수 — 반을 골랐을 때만 나온다. 누가 눈에 띄는지 바로 보인다. */
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
  /** 벌점 기준 — ClassNetChart와 같은 값이다. */
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

  // 눈에 띄어야 할 학생이 위로 오게 순점수 낮은 순으로 세운다.
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
                title={`${row.number ?? "—"}번 ${row.name}`}
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

/**
 * 분류별 분포. scopeLabel은 이 그래프가 덮는 기간이며 반드시 적는다 —
 * 기숙사는 머리글 합계가 누적인데 그래프만 최근 12개월이라 합이 달라 보인다.
 */
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
