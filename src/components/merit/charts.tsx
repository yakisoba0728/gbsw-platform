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
 * 그래프. **서버에서 그대로 그리는 CSS 막대**다 — 차트 라이브러리를 넣지 않는다.
 *
 * 관리자가 훑어보는 막대 몇 개에 100KB짜리 클라이언트 번들을 얹을 이유가 없고,
 * 시안의 카드·테두리·색 토큰을 그대로 쓰려면 직접 그리는 편이 더 정확하다.
 *
 * **값 표시도 JS 없이 한다** — 막대를 감싼 `group`에 hover/focus가 걸리면
 * 말풍선이 뜬다. `title` 속성(브라우저 기본 툴팁)은 뜨는 데 1초 이상 걸리고
 * 줄바꿈도 못 해서 여러 값을 한 번에 보여줄 수 없다.
 *
 * 터치 기기에는 hover가 없으므로 **막대 아래에 숫자를 함께 적는다.** 말풍선은
 * 거들 뿐이고, 없어도 값을 읽을 수 있어야 한다.
 */

/**
 * 그래프 카드는 ui/SectionCard 그대로다 — 여기 있던 ChartCard가 정확히 그것이라
 * 올려 보내고 이름만 남긴다. merit 전용인 구석이 없었다.
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
    <SectionCard title={title} hint={hint}>
      {children}
    </SectionCard>
  );
}

/** 데이터가 없을 때. 빈 축만 남으면 고장난 것처럼 보인다. */
function Empty({ children }: { children: React.ReactNode }) {
  return <EmptyState variant="inside">{children}</EmptyState>;
}

/**
 * 막대 위에 뜨는 말풍선. hover와 focus 둘 다에 반응한다 —
 * 키보드로 훑는 사람도 같은 값을 볼 수 있어야 한다.
 */
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
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-btn border border-line bg-surface px-3 py-2 whitespace-nowrap shadow-lg group-hover:block group-focus-within:block"
    >
      <span className="block text-[11px] font-bold text-ink">{title}</span>
      {rows.map((row) => (
        <span key={row.label} className="mt-0.5 flex items-center gap-2 text-[11px]">
          <span className="text-mut">{row.label}</span>
          <span className={`ml-auto font-bold ${row.className ?? "text-ink"}`}>
            {row.value}
          </span>
        </span>
      ))}
    </span>
  );
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
        <div className="flex items-stretch gap-1 overflow-x-auto pt-14">
          {points.map((point, i) => {
            const empty = !point.merit && !point.demerit && !point.offset;
            return (
              <div
                key={point.key}
                tabIndex={0}
                // 키보드로 막대 12개를 지나간다. role 없이 tabIndex만 있으면
                // 스크린리더가 "그룹" 정도로만 읽어서 무슨 달의 무슨 값인지가
                // 전혀 안 나온다. 막대 아래 숫자는 늘 보이므로(터치 기기 배려)
                // 이름에는 그것과 같은 내용만 적고 더 얹지 않는다.
                role="group"
                aria-label={`${point.label} 순점수 ${empty ? "없음" : signedNet(point.net)}`}
                className="group relative flex min-w-[30px] flex-1 flex-col gap-1 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-pri"
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
                    className="w-full rounded-t-[3px] bg-blue transition-opacity group-hover:opacity-80"
                    style={{ height: `${meritScale[i]}%` }}
                  />
                </div>
                <div className="h-px bg-line2" />
                {/* 아래: 벌점 */}
                <div className="flex h-16 items-start">
                  <div
                    className="w-full rounded-b-[3px] bg-rose transition-opacity group-hover:opacity-80"
                    style={{ height: `${demeritScale[i]}%` }}
                  />
                </div>

                <span className="text-center text-[10px] text-mut">{point.label}</span>
                {/* 터치 기기에는 hover가 없다 — 순점수는 늘 보이게 한다. */}
                <span
                  className={`text-center text-[10px] font-bold ${
                    empty ? "text-mut2" : point.net >= 0 ? "text-green" : "text-rose"
                  }`}
                >
                  {empty ? "—" : signedNet(point.net)}
                </span>
              </div>
            );
          })}
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
  thresholds,
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
  /** 벌점 기준 — 막대 옆 "!" 표시를 칠 기준이다. 관리자가 설정에서 정한다. */
  thresholds: DemeritThresholds;
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
              <span className="w-[76px] shrink-0 text-[12px] font-semibold text-ink">
                {row.grade}-{row.classNo}
                <DemeritFlag thresholds={thresholds} demerit={row.demerit} />
              </span>
              <span className="flex flex-1 justify-end">
                <span
                  className="h-4 rounded-l-[3px] bg-rose"
                  style={{ width: row.net < 0 ? `${scale[i]}%` : 0 }}
                />
              </span>
              <span className="h-5 w-px bg-line" />
              <span className="flex flex-1">
                <span
                  className="h-4 rounded-r-[3px] bg-green"
                  style={{ width: row.net >= 0 ? `${scale[i]}%` : 0 }}
                />
              </span>
              <span
                className={`w-[52px] shrink-0 text-right text-[12px] font-bold ${
                  row.net >= 0 ? "text-green" : "text-rose"
                }`}
              >
                {signedNet(row.net)}
              </span>
            </>
          );

          const shared =
            "group relative flex items-center gap-2 rounded-btn px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-pri";

          return hrefFor ? (
            <Link
              key={`${row.grade}-${row.classNo}`}
              href={hrefFor(row)}
              className={`${shared} hover:bg-soft`}
            >
              {body}
            </Link>
          ) : (
            // 링크가 아닐 때도 키보드로 훑을 수 있어야 말풍선(focus-within)이 뜬다.
            // role 없이 tabIndex만 주면 스크린리더가 "그룹" 정도로만 읽으므로
            // 무엇의 무슨 값인지를 이름에 적는다. 막대 아래 숫자는 늘 보이므로
            // 여기서 더 얹지 않는다.
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
              className="group relative flex items-center gap-2 rounded-btn px-1 py-0.5 outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-pri"
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
              <span className="w-[92px] shrink-0 truncate text-[12px] font-semibold text-ink">
                {row.name}
                <DemeritFlag thresholds={thresholds} demerit={row.demerit} />
              </span>
              <span className="flex flex-1 justify-end">
                <span
                  className="h-4 rounded-l-[3px] bg-rose"
                  style={{ width: row.net < 0 ? `${scale[i]}%` : 0 }}
                />
              </span>
              <span className="h-5 w-px bg-line" />
              <span className="flex flex-1">
                <span
                  className="h-4 rounded-r-[3px] bg-green"
                  style={{ width: row.net >= 0 ? `${scale[i]}%` : 0 }}
                />
              </span>
              <span
                className={`w-[52px] shrink-0 text-right text-[12px] font-bold ${
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

/** 분류별 분포. 무엇 때문에 점수가 오갔는지 보여준다. */
/**
 * scopeLabel은 이 그래프가 덮는 기간이다(MeritStats.chartRange).
 *
 * **반드시 적는다.** 기숙사는 머리글 합계가 입학부터 누적인데 이 그래프만 최근
 * 12개월을 세므로, 적지 않으면 분류별 합이 머리글 상점·벌점이나 "많이 나온
 * 항목"의 건수보다 작은 이유가 화면 어디에도 나오지 않는다.
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
        <Empty>아직 부여된 상벌점이 없습니다.</Empty>
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
            className="group relative flex items-center gap-2.5 rounded-btn px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-pri"
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
            <span className="w-[132px] shrink-0 truncate text-[12px] text-ink">
              {slice.category}
            </span>
            <span
              className={`w-[44px] shrink-0 text-[11px] font-bold ${kindColorClass(slice.kind)}`}
            >
              {MERIT_KIND_LABELS[slice.kind as MeritKind] ?? slice.kind}
            </span>
            <span className="h-4 flex-1 rounded-[3px] bg-soft">
              <span
                className={`block h-4 rounded-[3px] ${kindBarClass(slice.kind)} transition-opacity group-hover:opacity-80`}
                style={{ width: `${scale[i]}%` }}
              />
            </span>
            <span className="w-[64px] shrink-0 text-right text-[12px] text-mut">
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
        <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-mut">
          <span className={`size-2.5 rounded-[2px] ${item.color}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
