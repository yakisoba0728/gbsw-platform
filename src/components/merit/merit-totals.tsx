import type { MeritTotals } from "@/modules/merit/award.service";

/** 시안의 합계 3칸. 순점수는 음수가 될 수 있고 부호와 색으로 구분한다. */
export function MeritTotalsCards({ totals }: { totals: MeritTotals }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Card label="상점" value={String(totals.merit)} className="text-blue" />
      <Card label="벌점" value={String(totals.demerit)} className="text-rose" />
      <Card
        label="순점수"
        value={`${totals.net >= 0 ? "+" : ""}${totals.net}`}
        className={totals.net >= 0 ? "text-green" : "text-rose"}
      />
    </div>
  );
}

function Card({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3.5">
      <div className="text-[12px] font-semibold text-mut">{label}</div>
      <div className={`mt-1 text-[24px] font-extrabold ${className}`}>{value}</div>
    </div>
  );
}
