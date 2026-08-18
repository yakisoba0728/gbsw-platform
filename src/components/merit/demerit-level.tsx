import { demeritLevel, type DemeritThresholds } from "@/core/authz/merit-track";

/**
 * 벌점 누적 강조. 순점수가 아니라 벌점 총합을 본다 — 상점으로 덮었다고
 * 규정 위반이 없던 일이 되지는 않는다.
 */
export function demeritCellClass(
  thresholds: DemeritThresholds,
  demerit: number,
): string {
  const level = demeritLevel(thresholds, demerit);
  if (level === "danger")
    return "rounded-btn border border-rose-line bg-rose-soft px-2 py-0.5 font-medium text-rose";
  if (level === "warn") return "font-medium text-rose";
  return "text-rose";
}

/**
 * 그래프 막대 옆의 "!" 표시. 문구는 sr-only로 적는다 — role 없는 span의
 * aria-label은 대부분의 스크린리더가 무시한다.
 */
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
