import type { VerifyResult } from "@/modules/pass/verify.service";

/**
 * 판독 화면의 액션 상태. **`actions.ts`에 두지 않는다** — `"use server"` 파일의
 * export는 전부 서버 참조(함수)로 바뀌어서, 객체를 내보내면 오류 없이 함수가 되고
 * `useActionState`의 초기 상태 자리에 그대로 앉는다.
 * `(app)/pass/action-state.ts`와 같은 이유로 갈라 둔 파일이다.
 */
export type ScanState = {
  result: VerifyResult | null;
  error: string | null;
};

export const EMPTY_SCAN_STATE: ScanState = { result: null, error: null };
