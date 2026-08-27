"use server";

import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { verifyCodeSchema } from "@/modules/pass/pass.schema";
import { verifyStudentQr } from "@/modules/pass/verify.service";
import type { ScanState } from "./scan-state";

/**
 * **이 파일은 액션 하나만 내보낸다.** `"use server"` 파일의 export는 전부 서버
 * 참조(함수)로 바뀌므로 상태 타입과 빈 상태는 `scan-state.ts`에 둔다.
 */

/**
 * 사이트 안 스캐너가 부른다. 카메라가 읽은 **코드만** 받는다 — 주소가 아니다.
 * 출처·경로 확인은 클라이언트가 이미 했고, 코드 모양은 verifyStudentCode가 다시 본다.
 */
export async function scanAction(
  _prev: ScanState,
  formData: FormData,
): Promise<ScanState> {
  const actor = await requireAuth();

  const parsed = verifyCodeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { result: null, error: "코드를 읽지 못했습니다." };

  try {
    return { result: await verifyStudentQr(actor, parsed.data.code), error: null };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { result: null, error: "이 계정으로는 확인할 수 없습니다." };
    }
    throw error;
  }
}
