import { signedNet } from "@/core/authz/merit-track";
import type { MeritTotals } from "@/modules/merit/award.service";

/**
 * 합계 칸. 상쇄점은 0이 아닐 때만 칸이 생긴다 — 감추면 상점 − 벌점이 안 맞아 보인다.
 * 폭은 뷰포트가 아니라 놓인 자리를 본다: 대시보드의 좁은 카드 안에도 서기 때문이다.
 */
export function MeritTotalsCards({ totals }: { totals: MeritTotals }) {
  const showOffset = totals.offset !== 0;

  return (
    // 컨테이너 질의는 자기 자신을 볼 수 없다 — 기준이 될 상자를 한 겹 둔다.
    <div className="@container">
      <div
        className={
          showOffset
            ? "grid grid-cols-2 gap-3 @md:grid-cols-4"
            : "grid grid-cols-3 gap-3"
        }
      >
        <Card label="상점" value={String(totals.merit)} className="text-blue" />
        <Card label="벌점" value={String(totals.demerit)} className="text-rose" />
        {showOffset && (
          <Card label="상쇄점" value={String(totals.offset)} className="text-green" />
        )}
        <Card
          label="순점수"
          value={signedNet(totals.net)}
          className={totals.net >= 0 ? "text-green" : "text-rose"}
        />
      </div>
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
      <div className="text-xs font-medium text-mut">{label}</div>
      <div className={`mt-1 text-title font-semibold ${className}`}>{value}</div>
    </div>
  );
}
