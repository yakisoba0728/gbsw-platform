import type { MeritTotals } from "@/modules/merit/award.service";

/**
 * 시안의 합계 칸. 순점수는 음수가 될 수 있고 부호와 색으로 구분한다.
 *
 * **상쇄점은 있을 때만 칸이 생긴다.** 선도관리위원회 의결로만 나가는 예외적인
 * 항목이라 대부분의 학생은 0이고, 늘 "상쇄 0"을 띄우면 화면만 복잡해진다.
 * 대신 0이 아니면 반드시 보여야 한다 — 안 그러면 상점 − 벌점이 순점수와
 * 안 맞아서 보는 사람이 기록 전체를 의심하게 된다.
 */
export function MeritTotalsCards({ totals }: { totals: MeritTotals }) {
  const showOffset = totals.offset !== 0;

  return (
    <div className={showOffset ? "grid grid-cols-4 gap-3" : "grid grid-cols-3 gap-3"}>
      <Card label="상점" value={String(totals.merit)} className="text-blue" />
      <Card label="벌점" value={String(totals.demerit)} className="text-rose" />
      {showOffset && (
        <Card label="상쇄점" value={String(totals.offset)} className="text-green" />
      )}
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
