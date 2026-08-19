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
  saved: number | null;
  /** 반영 건수(saved) 중 계정째 삭제된 학생 수 (Minor-4) — "250건 반영, 50명 삭제"처럼
   * 성공 문구에 삭제 사실이 묻히지 않게 따로 보여준다. */
  deleted: number | null;
  /**
   * 신규로 잡혔지만 재학이 아니라 **아무것도 만들어지지 않은** 줄 (I1).
   *
   * 미리보기는 이들을 "신규 N"으로 세는데 확정 후엔 계정도 초대코드도 생기지
   * 않고 오류도 안 난다. 결과에 드러내지 않으면 관리자는 N명이 등록됐다고
   * 믿는다. 건수만으로는 파일을 고칠 수 없어 어느 줄인지까지 받는다.
   */
  excludedNew: { line: number; name: string; status: string | null }[];
  invites: { name: string; code: string; grade: number | null; classNo: number | null; number: number | null }[];
};

export const APPLY_INITIAL: ApplyState = {
  error: null,
  saved: null,
  deleted: null,
  excludedNew: [],
  invites: [],
};
