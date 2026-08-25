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

/**
 * 종류를 통째로 물들이는 패널. 배지와 같은 세 겹(옅은 바탕·같은 계열 테두리·
 * 진한 글자)을 면적으로 키운 것이라, 이 안에서는 배지를 겹쳐 쓰지 않는다 —
 * 같은 색 위에 같은 색이라 배지가 사라진다.
 */
const PANELS: Record<MeritKind, string> = {
  MERIT: "border-blue-line bg-blue-soft",
  DEMERIT: "border-rose-line bg-rose-soft",
  OFFSET: "border-green-line bg-green-soft",
};

/** 패널 안을 가르는 선. 중립 회색을 쓰면 물든 바탕에서 때처럼 보인다. */
const PANEL_LINES: Record<MeritKind, string> = {
  MERIT: "border-blue-line",
  DEMERIT: "border-rose-line",
  OFFSET: "border-green-line",
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

/** 패널 바탕·테두리. 모르는 종류는 중립 카드로 떨어진다. */
export function kindPanelClass(kind: string): string {
  const k = known(kind);
  return k ? PANELS[k] : "border-line bg-soft";
}

/** 패널 안의 구분선. 모르는 종류는 기본 선으로 떨어진다. */
export function kindLineClass(kind: string): string {
  const k = known(kind);
  return k ? PANEL_LINES[k] : "border-line";
}

/** 종류 이름. 모르는 종류는 원본 문자열 — 화면이 비지는 않는다. */
export function kindLabel(kind: string): string {
  const k = known(kind);
  return k ? MERIT_KIND_LABELS[k] : kind;
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
