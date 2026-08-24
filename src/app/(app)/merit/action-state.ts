export type MeritActionState = {
  error: string | null;
  ok: boolean;
  /** 일괄 부여에서 실제로 들어간 건수. 단건이면 1, 취소면 null. */
  count: number | null;
  /**
   * 실패했을 때 되돌려 주는 메모 제출값. 액션이 끝나면 React가 폼을 reset하므로
   * 메모 칸은 이 값을 defaultValue로 받아야 지워지는 대신 제출값으로 되돌아간다.
   *
   * 선택 칸이다 — 취소 버튼(`components/merit/cancel-button.tsx`)이 기대하는
   * 세 칸짜리 상태 계약에 필수 칸을 더하면 cancelAction이 그 prop에 안 들어간다.
   */
  note?: string;
};

export const EMPTY_MERIT_STATE: MeritActionState = {
  error: null,
  ok: false,
  count: null,
};
