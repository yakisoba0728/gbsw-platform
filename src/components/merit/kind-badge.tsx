import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  MERIT_KIND_LABELS,
  meritKindSign,
  type MeritKind,
} from "@/core/authz/merit-track";

const TONES: Record<MeritKind, BadgeTone> = {
  MERIT: "merit",
  DEMERIT: "demerit",
  OFFSET: "approved",
};

const TEXT_COLORS: Record<MeritKind, string> = {
  MERIT: "text-blue",
  DEMERIT: "text-rose",
  OFFSET: "text-green",
};

const BAR_COLORS: Record<MeritKind, string> = {
  MERIT: "bg-blue",
  DEMERIT: "bg-rose",
  OFFSET: "bg-green",
};

const PANELS: Record<MeritKind, string> = {
  MERIT: "border-blue-line bg-blue-soft",
  DEMERIT: "border-rose-line bg-rose-soft",
  OFFSET: "border-green-line bg-green-soft",
};

const PANEL_LINES: Record<MeritKind, string> = {
  MERIT: "border-blue-line",
  DEMERIT: "border-rose-line",
  OFFSET: "border-green-line",
};

function known(kind: string): MeritKind | null {
  return kind in TONES ? (kind as MeritKind) : null;
}

export function KindBadge({ kind }: { kind: string }) {
  const k = known(kind);
  return (
    <Badge tone={k ? TONES[k] : "neutral"}>{k ? MERIT_KIND_LABELS[k] : kind}</Badge>
  );
}

export function kindColorClass(kind: string): string {
  const k = known(kind);
  return k ? TEXT_COLORS[k] : "text-ink";
}

export function kindPanelClass(kind: string): string {
  const k = known(kind);
  return k ? PANELS[k] : "border-line bg-soft";
}

export function kindLineClass(kind: string): string {
  const k = known(kind);
  return k ? PANEL_LINES[k] : "border-line";
}

export function kindLabel(kind: string): string {
  const k = known(kind);
  return k ? MERIT_KIND_LABELS[k] : kind;
}

export function kindBarClass(kind: string): string {
  const k = known(kind);
  return k ? BAR_COLORS[k] : "bg-mut";
}

export function signedPoints(kind: string, points: number): string {
  return `${meritKindSign(kind)}${points}`;
}
