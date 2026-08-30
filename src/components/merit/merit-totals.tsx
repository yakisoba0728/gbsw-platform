import { StatStrip, StatTile } from "@/components/ui/stat-tile";
import { signedNet } from "@/core/authz/merit-track";
import type { MeritTotals } from "@/modules/merit/award.service";

/**
 * 합계 칸. 상쇄점은 0이 아닐 때만 칸이 생긴다 — 감추면 상점 − 벌점이 안 맞아 보인다.
 *
 * **테두리는 하나다.** 예전에는 칸마다 상자를 그렸는데, 이 묶음이 늘 카드 안에
 * 들어가므로 화면에는 「카드 안의 상자 셋」이 남았다 — 상자가 겹으로 서면 어느
 * 것이 묶음이고 어느 것이 낱개인지 테두리로는 알 수 없다. 셋은 한 값을 나눈
 * 조각이니 띠 하나로 묶고 사이만 머리카락 선으로 가른다.
 *
 * 폭은 뷰포트가 아니라 놓인 자리를 본다: 대시보드의 좁은 카드 안에도 서기 때문이다.
 */
export function MeritTotalsCards({ totals }: { totals: MeritTotals }) {
  const showOffset = totals.offset !== 0;

  return (
    <StatStrip
      className={
        showOffset ? "grid-cols-2 @md:grid-cols-4" : "grid-cols-3"
      }
    >
      <StatTile variant="plain" label="상점" value={totals.merit} valueClassName="text-blue" />
      <StatTile variant="plain" label="벌점" value={totals.demerit} valueClassName="text-rose" />
      {showOffset && (
        <StatTile variant="plain" label="상쇄점" value={totals.offset} valueClassName="text-green" />
      )}
      <StatTile
        variant="plain"
        label="순점수"
        value={signedNet(totals.net)}
        valueClassName={totals.net >= 0 ? "text-green" : "text-rose"}
      />
    </StatStrip>
  );
}
