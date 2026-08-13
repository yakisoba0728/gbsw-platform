import type { RosterRow } from "@/modules/enrollment/roster.parse";
import type { RosterPlan } from "@/modules/enrollment/roster.plan";

/*
 * `"use server"` 모듈은 async 함수만 내보낼 수 있다.
 * 상수를 거기 두면 클라이언트에서 undefined로 들어와 useActionState가 빈 상태로 시작한다.
 */
export type PreviewState = {
  error: string | null;
  year: number | null;
  rows: RosterRow[];
  plan: RosterPlan | null;
};

export const PREVIEW_INITIAL: PreviewState = {
  error: null,
  year: null,
  rows: [],
  plan: null,
};

export type ApplyState = {
  error: string | null;
  saved: number | null;
  invites: { name: string; code: string; grade: number | null; classNo: number | null; number: number | null }[];
};

export const APPLY_INITIAL: ApplyState = { error: null, saved: null, invites: [] };
