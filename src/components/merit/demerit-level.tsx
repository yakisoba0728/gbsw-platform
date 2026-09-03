import {
  demeritLevel,
  type DemeritLevel,
  type DemeritThresholds,
} from "@/modules/merit/merit.points";

const LEVEL_CLASS: Record<DemeritLevel, string> = {
  none: "text-rose",
  warn: "rounded-btn border border-rose-line px-2 py-0.5 font-medium text-rose",
  danger:
    "rounded-btn border border-rose-line bg-rose-soft px-2 py-0.5 font-medium text-rose",
};

export function DemeritCell({
  thresholds,
  demerit,
}: {
  thresholds: DemeritThresholds;
  demerit: number;
}) {
  const level = demeritLevel(thresholds, demerit);

  return (
    <span className={LEVEL_CLASS[level]}>
      {demerit}
      {level !== "none" && <span className="sr-only"> 벌점 기준 초과</span>}
    </span>
  );
}

export function DemeritFlag({
  thresholds,
  demerit,
}: {
  thresholds: DemeritThresholds;
  demerit: number;
}) {
  if (demeritLevel(thresholds, demerit) === "none") return null;

  return (
    <span className="ml-1 text-rose">
      <span aria-hidden>!</span>
      <span className="sr-only">벌점 기준 초과</span>
    </span>
  );
}
