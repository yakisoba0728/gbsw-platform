import { canonicalJson } from "@/lib/canonical-json";
import type { RosterRow } from "@/modules/enrollment/roster.parse";
import type { RosterPlan } from "@/modules/enrollment/roster.plan";

export function previewFingerprintFor({
  year,
  rows,
  plan,
  notices,
  rosterFingerprint,
  previewToken,
}: {
  year: number;
  rows: RosterRow[];
  plan: RosterPlan;
  notices: string[];
  rosterFingerprint?: string | null;
  previewToken?: string | null;
}): string {
  return canonicalJson({ year, rows, plan, notices, rosterFingerprint, previewToken });
}
