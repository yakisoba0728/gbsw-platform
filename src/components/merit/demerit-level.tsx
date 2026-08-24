import {
  demeritLevel,
  type DemeritLevel,
  type DemeritThresholds,
} from "@/core/authz/merit-track";

/**
 * 단계별 칸 모양. 세 단계가 색이 아니라 **테두리의 유무와 채움**으로 갈린다 —
 * 예전에는 warn과 none이 둘 다 맨 글자에 같은 rose였고 차이가 굵기 500 대 400뿐이라
 * 눈으로도 갈리지 않았다. warn은 테두리만, danger는 테두리에 채움까지 준다.
 * 상자 크기는 둘이 같다 — warn↔danger에서 숫자가 움직이면 표가 흔들린다.
 */
const LEVEL_CLASS: Record<DemeritLevel, string> = {
  none: "text-rose",
  warn: "rounded-btn border border-rose-line px-2 py-0.5 font-medium text-rose",
  danger:
    "rounded-btn border border-rose-line bg-rose-soft px-2 py-0.5 font-medium text-rose",
};

/**
 * 벌점 칸 전체. 순점수가 아니라 벌점 총합을 본다 — 상점으로 덮었다고 규정 위반이
 * 없던 일이 되지는 않는다. 테두리·채움은 화면을 보는 사람에게만 뜻이 있어
 * 스크린리더에는 아무 차이가 없으므로, 기준을 넘긴 칸은 sr-only 문구를 함께
 * 낸다(DemeritFlag와 같은 방식). 모양만 주는 함수는 두지 않는다 — 그 자리를
 * 쓰는 호출부는 이 문구를 잃는다.
 *
 * **반 합계에는 대지 않는다.** 기준은 학생 한 명에게 정한 값이라 인원이 많은 반은
 * 예외 없이 넘는다.
 *
 * warn·danger는 테두리와 좌우 여백으로 18px 넓어진다 — 이 칸이 앉는 열은 세 자리
 * 수를 기준으로 폭을 잡아야 옆 칸을 밀지 않는다.
 */
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
