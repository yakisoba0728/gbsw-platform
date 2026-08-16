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

/**
 * 그래프 막대 옆의 "!" 표시. 기준을 넘긴 반·학생을 눈에 띄게 한다.
 *
 * 문구는 sr-only로 따로 적는다. 전에는 `<span aria-label="벌점 기준 초과">!</span>`
 * 이었는데, **role 없는 span의 aria-label은 대부분의 스크린리더가 무시한다** —
 * 이름을 받을 수 있는 요소가 아니라서다. 결과적으로 "느낌표"만 읽혔다.
 */
export function DemeritFlag({ track, demerit }: { track: MeritTrack; demerit: number }) {
  if (demeritLevel(track, demerit) === "none") return null;

  return (
    <span className="ml-1 text-rose">
      <span aria-hidden>!</span>
      <span className="sr-only">벌점 기준 초과</span>
    </span>
  );
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
