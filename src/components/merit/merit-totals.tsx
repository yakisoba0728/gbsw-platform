import { signedNet } from "@/core/authz/merit-track";
import type { MeritTotals } from "@/modules/merit/award.service";

/**
 * 시안의 합계 칸. 순점수는 음수가 될 수 있고 부호와 색으로 구분한다.
 *
 * **상쇄점은 있을 때만 칸이 생긴다.** 선도관리위원회 의결로만 나가는 예외적인
 * 항목이라 대부분의 학생은 0이고, 늘 "상쇄 0"을 띄우면 화면만 복잡해진다.
 * 대신 0이 아니면 반드시 보여야 한다 — 안 그러면 상점 − 벌점이 순점수와
 * 안 맞아서 보는 사람이 기록 전체를 의심하게 된다.
 *
 * ## 왜 뷰포트가 아니라 컨테이너 질의인가
 * 칸이 4개일 때 `grid-cols-4`를 고정하면 375px에서 칸 하나의 내용 폭이 45px가
 * 되는데, 거기에 `+120` 같은 값이 24px 굵은 글씨로 들어가 옆 칸 위로 흘러나온다
 * (Tailwind의 grid 트랙은 `minmax(0,1fr)`이라 잘리지 않는다).
 *
 * 그런데 이 컴포넌트는 화면 전체 폭에도 서고(학생 상세) **대시보드 카드 안에도
 * 선다**(`lg:grid-cols-2` 안쪽). 뷰포트 브레이크포인트로 끊으면 넓은 화면에서
 * 오히려 좁은 카드 안이 4칸으로 펴져서 같은 겹침이 되살아난다. 그래서 뷰포트가
 * 아니라 **자기가 놓인 자리의 폭**을 본다.
 *
 * `@md`(448px)에서 끊는 이유: 4칸일 때 칸당 내용 폭은 대략
 * `(폭 − 간격 36 − 좌우 패딩 32) / 4`라 448px에서 약 71px이다. 한 단계 아래인
 * `@sm`(384px)이면 55px까지 내려가 `+120`(약 58px)이 다시 삐져나온다.
 * 그보다 좁으면 2×2로 접는다.
 *
 * 칸이 3개일 때는 375px에서도 내용 폭이 74px이라 그대로 한 줄에 둔다.
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
      <div className="text-[12px] font-semibold text-mut">{label}</div>
      <div className={`mt-1 text-[24px] font-extrabold ${className}`}>{value}</div>
    </div>
  );
}
