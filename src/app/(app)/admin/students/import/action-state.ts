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
  /** 줄 단위가 아니라 파일 전체에 해당하는 안내 (예: 학생코드 열 없음). */
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
  /** 실제로 달라진 재배정·학적변동·새 학년도 배정 줄 수. */
  saved: number | null;
  /** 이번 반영에서 새로 발급한 학생 초대코드 수. */
  invitesIssued: number | null;
  /** 명단에서 빠져 계정째 삭제된 학생 수. saved와 겹치지 않는 별도 집합이다. */
  deleted: number | null;
  /**
   * 신규로 잡혔지만 재학이 아니라 **아무것도 만들어지지 않은** 줄 (I1).
   *
   * 미리보기는 이들을 "신규 N"으로 세는데 확정 후엔 계정도 초대코드도 생기지
   * 않고 오류도 안 난다. 결과에 드러내지 않으면 교사는 N명이 등록됐다고
   * 믿는다. 건수만으로는 파일을 고칠 수 없어 어느 줄인지까지 받는다.
   */
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

/** 확정 결과의 서로 다른 세 건수를 한 문장에 섞지 않고 그대로 보여준다. */
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
