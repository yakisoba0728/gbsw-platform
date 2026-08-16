import { demeritLevel, DEMERIT_THRESHOLDS, type MeritTrack } from "@/core/authz/merit-track";

/**
 * 벌점 누적 강조.
 *
 * **표시만 한다.** 기준을 넘겨도 시스템이 회부·퇴사 같은 조치를 하지 않는다 —
 * 불이익을 주는 판단은 사람이 하고, 여기서는 눈에 띄게 해줄 뿐이다.
 *
 * 순점수가 아니라 **벌점 총합**을 본다. 상점으로 덮었다고 규정 위반이 없던
 * 일이 되지는 않기 때문이다.
 */
export function demeritCellClass(track: MeritTrack, demerit: number): string {
  const level = demeritLevel(track, demerit);
  if (level === "danger") return "rounded-btn bg-rose-soft px-2 py-0.5 font-extrabold text-rose";
  if (level === "warn") return "font-extrabold text-rose";
  return "font-bold text-rose";
}

/** 기준을 화면에 적어 둔다 — 숫자가 안 보이면 왜 붉은지 알 수 없다. */
export function ThresholdHint({ track }: { track: MeritTrack }) {
  const { warn, danger } = DEMERIT_THRESHOLDS[track];
  return (
    <p className="text-[12px] text-mut">
      벌점 {warn}점↑ 진하게 · {danger}점↑ 붉은 배경 (표시만, 자동 처리 없음)
    </p>
  );
}
