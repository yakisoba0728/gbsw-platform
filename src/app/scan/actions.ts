"use server";

import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { verifyCodeSchema } from "@/modules/pass/pass.schema";
import { verifyStudentQr } from "@/modules/pass/verify.service";
import type { ScanState } from "./scan-state";

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
