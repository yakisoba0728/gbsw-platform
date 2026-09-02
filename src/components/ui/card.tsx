import { cn } from "@/lib/cn";

type CardPad = "flush" | "panel" | "page";

const PADS: Record<CardPad, string> = {
  flush: "",
  panel: "p-5",
  page: "p-8",
};

export function cardClass(pad: CardPad = "panel", className?: string): string {
  return cn(
    "rounded-card border border-line bg-surface",
    PADS[pad],
    className,
  );
}
