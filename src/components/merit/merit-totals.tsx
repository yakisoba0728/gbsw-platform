import { StatStrip, StatTile } from "@/components/ui/stat-tile";
import type { MeritTotals } from "@/modules/merit/award.service";
import { signedNet } from "@/modules/merit/merit.points";

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
