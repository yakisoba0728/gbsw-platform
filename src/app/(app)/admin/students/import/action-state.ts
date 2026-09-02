import type { RosterRow } from "@/modules/enrollment/roster.parse";
import type { RosterPlan } from "@/modules/enrollment/roster.plan";

export type PreviewState = {
  error: string | null;
  year: number | null;
  rows: RosterRow[];
  plan: RosterPlan | null;
  notices: string[];
  rosterFingerprint: string | null;
  previewToken: string | null;
};

export const PREVIEW_INITIAL: PreviewState = {
  error: null,
  year: null,
  rows: [],
  plan: null,
  notices: [],
  rosterFingerprint: null,
  previewToken: null,
};

export type ApplyState = {
  error: string | null;
  saved: number | null;
  invitesIssued: number | null;
  deleted: number | null;
  excludedNew: { line: number; name: string; status: string | null }[];
  invites: { name: string; code: string; grade: number | null; classNo: number | null; number: number | null }[];
};

export const APPLY_INITIAL: ApplyState = {
  error: null,
  saved: null,
  invitesIssued: null,
  deleted: null,
  excludedNew: [],
  invites: [],
};

export function applySuccessMessage({
  saved,
  invitesIssued,
  deleted,
}: Pick<ApplyState, "saved" | "invitesIssued" | "deleted">): string | null {
  if (saved === null || invitesIssued === null) return null;

  const applied = `${saved}건 반영, 초대코드 ${invitesIssued}장 발급`;
  return deleted && deleted > 0
    ? `${applied}, ${deleted}명 명단에서 뺐습니다.`
    : `${applied}했습니다.`;
}
