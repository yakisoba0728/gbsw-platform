import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  MERIT_KIND_LABELS,
  meritKindSign,
  type MeritKind,
} from "@/core/authz/merit-track";

/** 종류의 화면 표현을 한곳에 모은다. 종류가 늘어도 여기만 고치면 된다. */

const TONES: Record<MeritKind, BadgeTone> = {
  MERIT: "merit",
  DEMERIT: "demerit",
  // 상쇄점은 상점·벌점 어느 쪽과도 구분되어야 한다 — 행정 조치라서다.
  OFFSET: "approved",
};

const TEXT_COLORS: Record<MeritKind, string> = {
  MERIT: "text-blue",
  DEMERIT: "text-rose",
  OFFSET: "text-green",
};

/** 그래프 막대의 채움색. 글자색(TEXT_COLORS)과 같은 색을 배경으로 쓴다. */
const BAR_COLORS: Record<MeritKind, string> = {
  MERIT: "bg-blue",
  DEMERIT: "bg-rose",
  OFFSET: "bg-green",
};

function known(kind: string): MeritKind | null {
  return kind in TONES ? (kind as MeritKind) : null;
}

/** 모르는 종류는 중립 톤에 원본 문자열 — 화면이 비지는 않는다. */
export function KindBadge({ kind }: { kind: string }) {
  const k = known(kind);
  return (
    <Badge tone={k ? TONES[k] : "neutral"}>{k ? MERIT_KIND_LABELS[k] : kind}</Badge>
  );
}

/** 점수 글자색. 모르는 종류는 기본 글자색으로 떨어진다. */
export function kindColorClass(kind: string): string {
  const k = known(kind);
  return k ? TEXT_COLORS[k] : "text-ink";
}

/** 막대 채움색. 모르는 종류는 중립 회색으로 떨어진다. */
export function kindBarClass(kind: string): string {
  const k = known(kind);
  return k ? BAR_COLORS[k] : "bg-mut";
}

/** `+5` · `−3` · `+60`. 부호는 종류가 정하며 사용자가 바꿀 수 없다. */
export function signedPoints(kind: string, points: number): string {
  return `${meritKindSign(kind)}${points}`;
}
