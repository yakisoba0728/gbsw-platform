import type { RosterRow } from "@/modules/enrollment/roster.parse";
import type { RosterPlan } from "@/modules/enrollment/roster.plan";

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(null);
}

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
  return canonicalize({ year, rows, plan, notices, rosterFingerprint, previewToken });
}
