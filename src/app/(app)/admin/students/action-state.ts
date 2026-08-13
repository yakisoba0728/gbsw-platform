/*
 * `"use server"` 모듈은 async 함수만 내보낼 수 있다.
 * 거기서 일반 객체를 export하면 클라이언트에서 undefined로 들어와
 * useActionState의 초기 상태가 비어버린다. 그래서 값은 여기 둔다.
 */
export type SaveState = {
  error: string | null;
  /** 실제로 저장된 학생 수. null이면 아직 저장한 적 없음. */
  saved: number | null;
};

export const SAVE_INITIAL: SaveState = { error: null, saved: null };
